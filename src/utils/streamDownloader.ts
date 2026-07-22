/**
 * Direct-To-Disk Streaming Downloader Utility
 * Prevents mobile and low-RAM tab crashes when saving large 10-30+ min rendered MP4 files
 * by streaming data chunks directly to disk using the File System Access API.
 */

export interface DownloadStreamOptions {
  filename?: string;
  blob?: Blob;
  stream?: ReadableStream<Uint8Array>;
  onProgress?: (bytesWritten: number, totalBytes?: number) => void;
}

export async function downloadLargeMediaFile(options: DownloadStreamOptions): Promise<boolean> {
  const filename = options.filename || `documentary_video_${Date.now()}.mp4`;

  // Method 1: File System Access API (Direct-to-Disk, zero RAM consumption)
  if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "MPEG-4 Video File",
            accept: { "video/mp4": [".mp4"] },
          },
        ],
      });

      const writableStream: FileSystemWritableFileStream = await handle.createWritable();

      if (options.blob) {
        // Stream blob in 4MB chunks to prevent memory spikes
        const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB
        const totalSize = options.blob.size;
        let offset = 0;

        while (offset < totalSize) {
          const slice = options.blob.slice(offset, offset + CHUNK_SIZE);
          const buffer = await slice.arrayBuffer();
          await writableStream.write(buffer);
          offset += slice.size;

          if (options.onProgress) {
            options.onProgress(offset, totalSize);
          }
        }
      } else if (options.stream) {
        const reader = options.stream.getReader();
        let bytesWritten = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            await writableStream.write(value);
            bytesWritten += value.byteLength;
            if (options.onProgress) {
              options.onProgress(bytesWritten);
            }
          }
        }
      }

      await writableStream.close();
      console.log("[StreamDownloader] Direct-to-disk write completed successfully.");
      return true;
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("[StreamDownloader] Save file picker cancelled by user.");
        return false;
      }
      console.warn("[StreamDownloader] Direct save picker unavailable/failed, using fallback:", err);
    }
  }

  // Method 2: Fallback anchor tag download for legacy browsers
  if (options.blob) {
    const url = URL.createObjectURL(options.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 10000);
    return true;
  }

  return false;
}
