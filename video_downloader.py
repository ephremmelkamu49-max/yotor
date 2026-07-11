import asyncio
import aiohttp
import os
import hashlib
import logging
from pathlib import Path
from typing import Optional, Dict, Any
import imageio_ffmpeg
import random
import yt_dlp

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Fix FFmpeg Error: Export the reliable imageio-ffmpeg executable to the environment
# This ensures Streamlit and downstream processes locate the binary without throwing '/BIN/SH: 1: FFMPEG: NOT FOUND'.
FFMPEG_PATH = imageio_ffmpeg.get_ffmpeg_exe()
os.environ["IMAGEIO_FFMPEG_EXE"] = FFMPEG_PATH
# Also append to PATH just in case other libraries (like moviepy) rely on it
os.environ["PATH"] = os.path.dirname(FFMPEG_PATH) + os.pathsep + os.environ.get("PATH", "")

CACHE_DIR = Path("video_cache")
CACHE_DIR.mkdir(exist_ok=True)
CHUNK_SIZE = 1024 * 1024 * 5  # 5MB chunks for optimal streaming and memory efficiency

def get_optimal_video_info(video_url: str) -> Dict[str, Any]:
    """
    Uses yt-dlp to extract video metadata and specifically target 1080p or 720p.
    Strictly avoids 4K to save bandwidth and server memory.
    """
    ydl_opts = {
        # Data Efficiency: Select best video <= 1080p or fallback to <= 720p
        'format': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/bestvideo[height<=720]+bestaudio/best[height<=720]',
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info_dict = ydl.extract_info(video_url, download=False)
        return info_dict

async def _download_chunk(session: aiohttp.ClientSession, url: str, start: int, end: int, filepath: Path, attempt: int = 1, max_retries: int = 5):
    """
    Downloads a specific byte range of a file with exponential backoff for resilience.
    Writes directly to the pre-allocated file to prevent RAM overload.
    """
    headers = {'Range': f'bytes={start}-{end}'}
    try:
        async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=60)) as response:
            response.raise_for_status()
            chunk_data = await response.read()
            
            # Write chunk directly to disk at the exact offset to save RAM
            with open(filepath, 'r+b') as f:
                f.seek(start)
                f.write(chunk_data)
                
            return True
            
    except (aiohttp.ClientError, asyncio.TimeoutError) as e:
        if attempt <= max_retries:
            backoff_time = (2 ** attempt) + random.uniform(0, 1)
            logger.warning(f"Chunk {start}-{end} failed (attempt {attempt}). Retrying in {backoff_time:.2f}s... Error: {e}")
            await asyncio.sleep(backoff_time)
            return await _download_chunk(session, url, start, end, filepath, attempt + 1, max_retries)
        else:
            logger.error(f"Failed to download chunk {start}-{end} after {max_retries} attempts.")
            raise

async def download_video_concurrently(video_url: str) -> Path:
    """
    Main entry point for the optimized downloading engine.
    """
    # 1. Fetch metadata & filter resolution (1080p/720p only)
    info = get_optimal_video_info(video_url)
    
    # yt-dlp formats might combine or split streams, we grab the best direct URL available
    direct_url = info.get('url')
    if not direct_url:
        requested_formats = info.get('requested_formats', [])
        if requested_formats:
             direct_url = requested_formats[0].get('url')
             
    if not direct_url:
        raise ValueError("Could not extract a direct video URL.")

    # 2. Resilient Caching Layer
    # Hash the original URL (or video ID) so identical videos are never downloaded twice
    video_id = info.get('id', hashlib.md5(video_url.encode()).hexdigest())
    ext = info.get('ext', 'mp4')
    cache_path = CACHE_DIR / f"{video_id}.{ext}"
    
    if cache_path.exists() and cache_path.stat().st_size > 0:
        logger.info(f"Video retrieved from cache: {cache_path}")
        return cache_path

    logger.info(f"Starting concurrent download for {video_id} (Resolution: {info.get('height', 'Unknown')}p)")
    
    # 3. Concurrent Chunk Downloading
    async with aiohttp.ClientSession() as session:
        # Determine total file size for chunking
        async with session.head(direct_url, allow_redirects=True) as response:
            size_str = response.headers.get('Content-Length')
            if not size_str:
                logger.warning("Content-Length missing. Falling back to sequential stream download.")
                # Fallback to sequential stream if chunking is unsupported by server
                async with session.get(direct_url) as seq_res:
                    with open(cache_path, 'wb') as f:
                        async for chunk in seq_res.content.iter_chunked(CHUNK_SIZE):
                            f.write(chunk)
                return cache_path
                
            expected_size = int(size_str)

        # Pre-allocate the file on disk to prevent fragmentation and allow random access writes
        with open(cache_path, "wb") as f:
            f.truncate(expected_size)

        tasks = []
        for start in range(0, expected_size, CHUNK_SIZE):
            end = min(start + CHUNK_SIZE - 1, expected_size - 1)
            tasks.append(_download_chunk(session, direct_url, start, end, cache_path))

        # Limit concurrency to 10 simultaneous connections to prevent TCP exhaustion
        semaphore = asyncio.Semaphore(10)
        
        async def bounded_task(task):
            async with semaphore:
                return await task
                
        await asyncio.gather(*(bounded_task(t) for t in tasks))
        
        logger.info(f"Download complete: {cache_path}")
        return cache_path

def get_ffmpeg_binary() -> str:
    """Helper to return the safely resolved FFmpeg binary path."""
    return FFMPEG_PATH

# --- Example Streamlit Integration ---
# This is how you would use it in your Streamlit app:
#
# import streamlit as st
# 
# st.title("Robust Video Downloader")
# url = st.text_input("Enter Video URL")
# if st.button("Download"):
#     with st.spinner("Downloading efficiently..."):
#         try:
#             video_path = asyncio.run(download_video_concurrently(url))
#             st.success(f"Downloaded to {video_path}")
#             st.video(str(video_path))
#         except Exception as e:
#             st.error(f"Download failed: {e}")
