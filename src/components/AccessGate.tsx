import React, { useState, useEffect } from 'react';
import { Lock, Unlock, ShieldCheck, CreditCard, Mail, Key, Sparkles, UserCheck, Plus, Trash2, Settings, X, Coins, Smartphone, Clock, Send, Bell, Bot } from 'lucide-react';

interface AccessGateProps {
  children: React.ReactNode;
}

export default function AccessGate({ children }: AccessGateProps) {
  // Master Owner Email
  const MASTER_OWNER = 'ephremmelkamu49@gmail.com';
  const BACKUP_OWNER = 'josij9989@gmail.com';
  
  // Default VIP Codes
  const DEFAULT_VIP_KEYS = ['YOTOR-PREMIUM-ACCESS-CODE', 'YOTOR-OFFICIAL-2026'];

  // Whitelist State
  const [whitelist, setWhitelist] = useState<string[]>(() => {
    const saved = localStorage.getItem('yotor_whitelist');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [MASTER_OWNER, BACKUP_OWNER];
      }
    }
    return [MASTER_OWNER, BACKUP_OWNER];
  });

  // Approved VIP codes
  const [vipKeys, setVipKeys] = useState<string[]>(() => {
    const saved = localStorage.getItem('yotor_vip_keys');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_VIP_KEYS;
      }
    }
    return DEFAULT_VIP_KEYS;
  });

  // Global protection status (Is lock gate active)
  const [isGateActive, setIsGateActive] = useState<boolean>(() => {
    const saved = localStorage.getItem('yotor_gate_active');
    return saved !== 'false'; // defaults to true
  });

  // Paid/unlocked email sessions tracker
  const [unlockedEmails, setUnlockedEmails] = useState<string[]>(() => {
    const saved = localStorage.getItem('yotor_unlocked_emails');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  // Pending approval requests for phone numbers
  const [pendingRequests, setPendingRequests] = useState<string[]>(() => {
    const saved = localStorage.getItem('yotor_pending_requests');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('yotor_pending_requests', JSON.stringify(pendingRequests));
  }, [pendingRequests]);

  // Current session email
  const [currentEmail, setCurrentEmail] = useState<string>(() => {
    return localStorage.getItem('yotor_session_email') || '';
  });

  // Simulation parameters for Telebirr
  const [emailInput, setEmailInput] = useState('');
  const [vipInput, setVipInput] = useState('');
  const [telebirrPhone, setTelebirrPhone] = useState('');
  const [telebirrName, setTelebirrName] = useState('');
  const [telebirrOtp, setTelebirrOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [targetQuality, setTargetQuality] = useState<'720p' | '1080p'>('1080p');
  
  // Tracks subscription quality tier per email
  const [emailPlans, setEmailPlans] = useState<{ [email: string]: '720p' | '1080p' }>(() => {
    const saved = localStorage.getItem('yotor_email_plans');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return {};
      }
    }
    return {};
  });

  useEffect(() => {
    localStorage.setItem('yotor_email_plans', JSON.stringify(emailPlans));
  }, [emailPlans]);
  
  // UI Tabs toggle for lock modal: 'login' | 'pay' | 'vip'
  const [lockTab, setLockTab] = useState<'login' | 'pay' | 'vip'>('login');
  
  // Is admin dashboard open
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  
  // Extra input variables inside Admin Panel
  const [newWhitelistEmail, setNewWhitelistEmail] = useState('');
  const [newVipKey, setNewVipKey] = useState('');

  // Persists states automatically
  useEffect(() => {
    localStorage.setItem('yotor_whitelist', JSON.stringify(whitelist));
  }, [whitelist]);

  useEffect(() => {
    localStorage.setItem('yotor_vip_keys', JSON.stringify(vipKeys));
  }, [vipKeys]);

  useEffect(() => {
    localStorage.setItem('yotor_gate_active', String(isGateActive));
  }, [isGateActive]);

  useEffect(() => {
    localStorage.setItem('yotor_unlocked_emails', JSON.stringify(unlockedEmails));
  }, [unlockedEmails]);

  // Authenticate current session
  const isSessionUnlocked = () => {
    if (!isGateActive) return true;
    if (!currentEmail) return false;
    
    // Master owners get instant free access
    const normalizedEmail = currentEmail.toLowerCase().trim();
    if (normalizedEmail === MASTER_OWNER || normalizedEmail === BACKUP_OWNER) return true;
    
    // Whitelist check
    if (whitelist.map(e => e.toLowerCase().trim()).includes(normalizedEmail)) {
      return true;
    }
    
    // Paid sessions check
    if (unlockedEmails.map(e => e.toLowerCase().trim()).includes(normalizedEmail)) {
      return true;
    }

    return false;
  };

  const handleIdentitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    const input = emailInput.trim();

    if (!input) {
      setErrorMessage('እባክዎ መግቢያ ስልክ ቁጥርዎን ያስገቡ። / Please enter your phone number.');
      return;
    }

    const isEmail = input.includes('@');
    if (isEmail) {
      const email = input.toLowerCase();
      localStorage.setItem('yotor_session_email', email);
      setCurrentEmail(email);

      if (email === MASTER_OWNER || email === BACKUP_OWNER) {
        setSuccessMessage('እንኳን በደህና መጡ ባለቤት! ልዩ አስተዳዳሪ ፈቃድ በትክክል ጸድቋል። / Welcome Master Creator!');
      } else if (whitelist.map(v => v.toLowerCase().trim()).includes(email)) {
        setSuccessMessage('የነፃ መግቢያ ፈቃድዎ ተረጋግጧል! ወደ ስቱዲዮ መግባት ይችላሉ። / Your Free Access has been verified!');
      } else if (unlockedEmails.includes(email)) {
        setSuccessMessage('ፕሪሚየም የክፍያ ማረጋገጫዎ ንቁ ነው! / Your Paid Premium registration is active.');
      } else {
        setLockTab('pay');
      }
      return;
    }

    // Otherwise, validate as phone number (typically 9 or 10 digits starting with 09, 07, or 251 or general digits)
    const cleanedDigits = input.replace(/\D/g, '');
    if (cleanedDigits.length < 9 || cleanedDigits.length > 13) {
      setErrorMessage('እባክዎ በትክክል የ9 ወይም 10 አሃዝ ስልክ ቁጥር ያስገቡ (ለምሳሌ 0912345678)። / Please enter a valid 9 or 10-digit phone number.');
      return;
    }

    localStorage.setItem('yotor_session_email', cleanedDigits);
    setCurrentEmail(cleanedDigits);

    if (whitelist.includes(cleanedDigits)) {
      setSuccessMessage('የነፃ መግቢያ ፈቃድዎ ተረጋግጧል! ወደ ስቱዲዮ መግባት ይችላሉ። / Your Free Access has been verified!');
    } else if (unlockedEmails.includes(cleanedDigits)) {
      setSuccessMessage('ፕሪሚየም የክፍያ ማረጋገጫዎ ንቁ ነው! ወደ ስቱዲዮ መግባት ይችላሉ። / Your Paid Premium registration is active.');
    } else {
      // Direct transition to Checkout tab
      setLockTab('pay');
      setTelebirrPhone(cleanedDigits);
    }
  };

  const handleVipKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    const code = vipInput.trim().toUpperCase();

    if (!vipKeys.includes(code)) {
      setErrorMessage('የተሳሳተ ልዩ የፈቃድ ኮድ! እባክዎ በትክክል ያረጋግጡ። / Invalid VIP Pass Code.');
      return;
    }

    if (!currentEmail) {
      setErrorMessage('መጀመሪያ ስልክ ቁጥርዎን ያስገቡ። / Please enter your Phone identity first.');
      setLockTab('login');
      return;
    }

    // Add current session email to unlocked/whitelisted list for free
    const updatedWhitelist = [...new Set([...whitelist, currentEmail])];
    setWhitelist(updatedWhitelist);
    setSuccessMessage('ድንቅ! የቪአይፒ ፈቃዱ በትክክል ሰርቷል፣ ሙሉ በነፃ መግባት ይችላሉ። / VIP Code Activated Successfully!');
    setVipInput('');
  };

  const handleSimulatedPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!currentEmail) {
      setErrorMessage('እባክዎ ከመክፈልዎ በፊት መጀመሪያ ስልክ ቁጥርዎን ያስገቡ። / Please specify registration phone number first.');
      setLockTab('login');
      return;
    }

    // Set simulated telebirr phone automatically from active session if empty
    const finalPhone = telebirrPhone || currentEmail || '';

    // Phase 1: Request SMS confirmation OTP code
    if (!otpSent) {
      setPaymentLoading(true);
      setTimeout(() => {
        setPaymentLoading(false);
        setOtpSent(true);
        setErrorMessage('');
      }, 1205);
      return;
    }

    // Phase 2: Confirm OTP
    if (!telebirrOtp || telebirrOtp.trim().length !== 4) {
      setErrorMessage('እባክዎ የላክንልዎትን ባለ 4-አሃዝ የኤስኤምኤስ ኮድ ያስገቡ (ለምሳሌ 1234)። / Please enter the 4-digit SMS OTP code sent to your phone (use "1234").');
      return;
    }

    setPaymentLoading(true);
    setTimeout(() => {
      setPaymentLoading(false);
      const updatedPaid = [...new Set([...unlockedEmails, currentEmail])];
      setUnlockedEmails(updatedPaid);
      
      // Update plan mapping
      const updatedPlans = { ...emailPlans, [currentEmail]: targetQuality };
      setEmailPlans(updatedPlans);
      
      const priceTag = targetQuality === '1080p' ? '15,000 (አስራ አምስት ሺህ)' : '10,000 (አስር ሺህ)';
      setSuccessMessage(`አስደናቂ! የ${priceTag} ብር የቴሌብር ወርሃዊ ክፍያዎ በትክክል ተረጋግጧል። የዮቶር (Yotor) ${targetQuality} ስቱዲዮ መዳረሻ በትክክል ተከፍቷል። / Telebirr Monthly ${targetQuality} HD Subscription Active!`);
      setOtpSent(false);
      setTelebirrOtp('');
    }, 1800);
  };

  const handleResetSession = () => {
    localStorage.removeItem('yotor_session_email');
    setCurrentEmail('');
    setEmailInput('');
    setErrorMessage('');
    setSuccessMessage('');
    setLockTab('login');
    setOtpSent(false);
    setTelebirrOtp('');
    setTelebirrPhone('');
    setTelebirrName('');
  };

  const handleTriggerUpgrade = () => {
    const savedEmail = currentEmail;
    localStorage.removeItem('yotor_session_email');
    setCurrentEmail('');
    setEmailInput(savedEmail);
    setErrorMessage('');
    setSuccessMessage('');
    setLockTab('pay');
    setTargetQuality('1080p');
    setOtpSent(false);
    setTelebirrOtp('');
    setTelebirrPhone('');
    setTelebirrName('');
  };

  const addToWhitelist = () => {
    const identity = newWhitelistEmail.trim().toLowerCase();
    if (identity && !whitelist.includes(identity)) {
      setWhitelist([...whitelist, identity]);
      setNewWhitelistEmail('');
    }
  };

  const removeFromWhitelist = (email: string) => {
    if (email === MASTER_OWNER || email === BACKUP_OWNER) return; // Perfect protect owners
    setWhitelist(whitelist.filter(e => e !== email));
  };

  const generateNewVipKey = () => {
    const key = newVipKey.trim().toUpperCase();
    if (key && !vipKeys.includes(key)) {
      setVipKeys([...vipKeys, key]);
      setNewVipKey('');
    }
  };

  const removeVipKey = (key: string) => {
    setVipKeys(vipKeys.filter(k => k !== key));
  };

  const handleRequestApproval = () => {
    if (!currentEmail) {
      setErrorMessage('እባክዎ መጀመሪያ ስልክ ቁጥርዎን ያስገቡ። / Please enter phone number first.');
      setLockTab('login');
      return;
    }
    const clean = currentEmail.toLowerCase().trim();
    if (pendingRequests.includes(clean)) {
      setSuccessMessage('የመዳረሻ ፈቃድ ጥያቄዎ ቀድሞውኑ ተልኳል። እባክዎ ባለቤቱ እስኪያጸድቁት ድረስ ይጠብቁ... / Your request is already pending. Please wait for owner approval.');
      return;
    }
    setPendingRequests([...pendingRequests, clean]);
    setSuccessMessage('የመዳረሻ ፈቃድ ጥያቄዎ በትክክል ለባለቤቱ ተልኳል! ክፍያዎን ካረጋገጡ በኋላ ባለቤቱ ያጸድቁታል። / Access request submitted! Approval will be granted once payment is verified.');
  };

  const isUnlocked = isSessionUnlocked();

  const getActivePlanLabel = (): '720p' | '1080p' | 'owner' | 'whitelist' => {
    if (!currentEmail) return '720p';
    const normalized = currentEmail.toLowerCase().trim();
    if (normalized === MASTER_OWNER || normalized === BACKUP_OWNER) {
      return 'owner';
    }
    if (whitelist.map((e: string) => e.toLowerCase().trim()).includes(normalized)) {
      return 'whitelist';
    }
    return emailPlans[normalized] || '720p';
  };

  return (
    <>
      {!isUnlocked ? (
        <div className="fixed inset-0 bg-[#09090b] text-zinc-100 z-[9999] flex items-center justify-center p-4 overflow-y-auto font-sans">
          {/* Subtle cosmic particle glow and canvas style grid */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293708_1px,transparent_1px),linear-gradient(to_bottom,#1f293708_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none" />
          
          <div className="bg-[#0e0e11] border border-zinc-900 rounded-3xl max-w-md w-full p-8 shadow-2xl relative overflow-hidden z-10 flex flex-col space-y-6">
            
            {/* Header branding */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-500 text-white shadow-xl shadow-indigo-500/10 mb-2">
                <Lock size={26} className="animate-pulse" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 via-indigo-200 to-white font-sans uppercase">
                YOTOR
              </h1>
              <p className="text-[10px] font-mono tracking-widest text-[#8e909a] uppercase">
                High-definition Cinematic Engine / ዮቶር
              </p>
            </div>

            {/* Error & Success Alert Boxes */}
            {errorMessage && (
              <div className="p-3 bg-red-950/20 border border-red-900/40 text-red-400 text-xs rounded-xl text-center leading-relaxed">
                {errorMessage}
              </div>
            )}
            {successMessage && (
              <div className="p-3.5 bg-emerald-950/20 border border-emerald-900/40 text-emerald-400 text-xs rounded-xl text-center leading-relaxed font-medium">
                {successMessage}
                <button 
                  onClick={() => {
                    setSuccessMessage('');
                  }}
                  className="block mx-auto mt-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 font-bold uppercase tracking-wider font-mono text-[9px] text-white rounded-lg transition-colors"
                >
                  Confirm Entry / ወደ መተግበሪያው ግባ
                </button>
              </div>
            )}

            {/* Conditional Pending Request screen VS normal credential tabs */}
            {currentEmail && pendingRequests.includes(currentEmail.toLowerCase().trim()) && !isUnlocked ? (
              <div className="space-y-6 text-center py-4">
                <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-cyan-500/15 animate-ping" />
                  <div className="w-12 h-12 rounded-full bg-cyan-950 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <Clock size={20} className="animate-spin" style={{ animationDuration: '4s' }} />
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-widest font-mono">⏳ ጥያቄዎ በመጠባበቅ ላይ ነው / Approval Pending</h3>
                  <p className="text-[11px] text-[#8e909a] leading-relaxed max-w-sm mx-auto">
                    የስልክ ቁጥርዎ <strong className="text-zinc-200 font-mono text-xs">{currentEmail}</strong> ለደህንነት ሲባል ተመዝግቧል። 
                  </p>
                  <p className="text-[10px] text-indigo-400 leading-normal px-2">
                    መዳረሻዎ እንዲጸድቅ የቴሌብር ክፍያ ማረጋገጫ ለባለቤቱ (<strong>0979036932</strong>) መላክ ይኖርብዎታል ወይም ባለቤቱ በሲስተሙ እንዲፈቅድልዎ ይጠብቁ።
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (isSessionUnlocked()) {
                        setSuccessMessage('የመዳረሻ ፈቃድዎ በትክክል ተረጋግጧል! ወደ ስቱዲዮ መግባት ይችላሉ። / Your Access has been verified!');
                      } else {
                        setErrorMessage('እስካሁን አልተፈቀደም። እባክዎ ለጥቂት ደቂቃዎች ይጠብቁ ወይም ባለቤቱን በስልክ ያግኙት። / Not approved yet. Please wait a few more minutes.');
                        setTimeout(() => setErrorMessage(''), 4005);
                      }
                    }}
                    className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-cyan-600/10 font-mono"
                  >
                    🔄 ሁኔታውን አረጋግጥ / Verify Approval Status
                  </button>

                  <button
                    type="button"
                    onClick={handleResetSession}
                    className="text-[9.5px] font-mono uppercase text-red-400 underline tracking-wider block mx-auto hover:text-red-300"
                  >
                    ቀይር ወይም ውጣ / Log out & Change Phone
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Tabs selector */}
                {!successMessage && (
              <div className="grid grid-cols-3 gap-1 bg-[#050505] p-1 rounded-xl border border-zinc-900 text-[10px] font-mono tracking-wider">
                <button
                  type="button"
                  onClick={() => setLockTab('login')}
                  className={`py-2 px-1 rounded-lg text-center transition-all ${
                    lockTab === 'login' 
                      ? 'bg-zinc-900 text-indigo-400 font-bold' 
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  1. PHONE (ስልክ ቁጥር)
                </button>
                <button
                  type="button"
                  onClick={() => setLockTab('pay')}
                  className={`py-2 px-1 rounded-lg text-center transition-all ${
                    lockTab === 'pay' 
                      ? 'bg-zinc-900 text-indigo-400 font-bold' 
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  2. ACCESS GATE
                </button>
                <button
                  type="button"
                  onClick={() => setLockTab('vip')}
                  className={`py-2 px-1 rounded-lg text-center transition-all ${
                    lockTab === 'vip' 
                      ? 'bg-zinc-900 text-indigo-400 font-bold' 
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  3. VIP PASSKEY
                </button>
              </div>
            )}

            {/* TAB CONTENT: 1. Identity Check / Phone Verification */}
            {lockTab === 'login' && !successMessage && (
              <form onSubmit={handleIdentitySubmit} className="space-y-4">
                <div className="space-y-1.5 text-center">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest font-mono">Verify Phone Credentials</h3>
                  <p className="text-[11px] text-zinc-500">ስቱዲዮውን ለማስጀመር ወይም ማንነትዎን ለማረጋገጫ ስልክ ቁጥርዎን ያስገቡ።</p>
                </div>

                <div className="relative">
                  <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-650" size={16} />
                  <input
                    type="text"
                    placeholder="ለምሳሌ፡ 0912345678"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full bg-[#050505] border border-zinc-900 rounded-xl py-3 pl-10 pr-4 text-xs font-mono text-zinc-200 placeholder-zinc-750 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-500/10 font-mono"
                >
                  Continue & Check Access
                </button>

                <div className="p-3 bg-[#050505] border border-zinc-900/60 rounded-xl flex items-start gap-2.5 text-[10px] text-zinc-500">
                  <span className="text-indigo-500 font-bold">ℹ️ ማስታወሻ:</span>
                  <span>
                    ይህ ፕሮፌሽናል የቪዲዮ ስራ መስሪያ ስቱዲዮ ነው። መዳረሻ እንዲሰጥዎ በቅድሚያ ክፍያ መፈጸም ወይም በባለቤቱ የተፈቀደ የቪአይፒ ኮድ ሊኖርዎ ይገባል። / This is a professional cinematic studio. Access requires a paid subscription or owner-approved VIP pass.
                  </span>
                </div>
              </form>
            )}

            {/* TAB CONTENT: 2. Checkout Monitization Gate */}
            {lockTab === 'pay' && !successMessage && (
              <form onSubmit={handleSimulatedPayment} className="space-y-4">
                <div className="text-center space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] uppercase font-mono tracking-widest block mx-auto">
                    <ShieldCheck size={12} className="animate-pulse" />
                    Official Payment & Validation Interface
                  </div>
                  <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-widest font-mono pt-1">
                    Select Your Premium Package
                  </h3>
                  <p className="text-[11px] text-zinc-450 leading-relaxed">
                    እባክዎ የእርስዎን የጥራት ምርጫ እና ወርሃዊ የቴሌብር እቅድ ይምረጡ።
                  </p>
                </div>

                {/* Sparkling Receiver Merchant Phone Display */}
                <div className="relative overflow-hidden p-3.5 rounded-2xl border border-cyan-500/15 bg-gradient-to-r from-cyan-950/20 to-zinc-950 flex items-center justify-between text-left gap-3">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-cyan-500/10 to-transparent rounded-bl-full pointer-events-none" />
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                      <Smartphone size={15} />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[8.5px] font-mono uppercase tracking-widest text-cyan-400 font-bold block">የመክፈያ ስልክ ቁጥር (Merchant Phone)</span>
                      <p className="text-[13px] font-mono font-black text-zinc-200 tracking-wider">0979036932</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[8.5px] font-mono text-zinc-500 block uppercase">ሂሳብ ተቀባይ / Name</span>
                    <span className="text-[10.5px] font-bold text-zinc-350 block">Ephrem Melkamu (Yotor)</span>
                  </div>
                </div>

                {/* Quality tier choice cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {/* 720p HD Core Package */}
                  <div 
                    onClick={() => !otpSent && setTargetQuality('720p')}
                    className={`cursor-pointer p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between h-[105px] ${
                      targetQuality === '720p'
                        ? 'border-teal-500 bg-teal-500/5 shadow-md'
                        : 'border-zinc-900 bg-zinc-950 hover:bg-zinc-900/60'
                    } ${otpSent ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-200 uppercase">720p HD Quality</span>
                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          targetQuality === '720p' ? 'border-teal-500 bg-teal-500' : 'border-zinc-700'
                        }`}>
                          {targetQuality === '720p' && <div className="w-1.5 h-1.5 bg-zinc-950 rounded-full" />}
                        </div>
                      </div>
                      <p className="text-[9px] text-[#8e909a] mt-1 pr-1">መደበኛ ጥራት (HD) / Standard cinematic production</p>
                    </div>
                    <div className="text-xs font-mono font-black text-teal-400">
                      10,000 ETB <span className="text-[9px] font-normal text-zinc-500">/በወር</span>
                    </div>
                  </div>

                  {/* 1080p Full HD Cosmic Studio Package */}
                  <div 
                    onClick={() => !otpSent && setTargetQuality('1080p')}
                    className={`cursor-pointer p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between h-[105px] ${
                      targetQuality === '1080p'
                        ? 'border-cyan-500 bg-cyan-500/5 shadow-md'
                        : 'border-zinc-900 bg-zinc-950 hover:bg-zinc-900/60'
                    } ${otpSent ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="absolute top-1.5 right-1.5 bg-gradient-to-r from-cyan-500 to-indigo-500 text-zinc-950 text-[7.5px] font-mono font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider scale-90">
                      BEST VALUE
                    </div>
                    <div>
                      <div className="flex items-center justify-between pr-14">
                        <span className="text-xs font-bold text-zinc-200 uppercase">1080p Full HD</span>
                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          targetQuality === '1080p' ? 'border-cyan-500 bg-cyan-500' : 'border-zinc-700'
                        }`}>
                          {targetQuality === '1080p' && <div className="w-1.5 h-1.5 bg-zinc-950 rounded-full" />}
                        </div>
                      </div>
                      <p className="text-[9px] text-[#8e909a] mt-1">ላቀ ጥራት (FHD) / Cinematic stunning rendering</p>
                    </div>
                    <div className="text-xs font-mono font-black text-cyan-400">
                      15,000 ETB <span className="text-[9px] font-normal text-zinc-500">/በወር</span>
                    </div>
                  </div>
                </div>

                <div className="p-2.5 bg-[#050505] border border-zinc-900 rounded-xl text-center text-[10px] text-zinc-500">
                  ⚠️ ማሳሰቢያ፡- Yotor ጥራትን ለመጠበቅ ሲል ከ 720p በታች ያሉ ጥራቶችን (qualities) ሙሉ በሙሉ አያቀርብም።
                </div>

                {currentEmail ? (
                  <div className="bg-[#050505] border border-zinc-900 p-2 text-center rounded-xl text-[10px] text-zinc-400 font-mono">
                    {currentEmail.includes('@') ? 'የአስተዳዳሪ ኢሜይል / Admin Email: ' : 'የተጠቃሚ ስልክ / Active Phone: '}
                    <span className="text-indigo-400">{currentEmail}</span>
                    <button 
                      type="button"
                      onClick={handleResetSession}
                      className="text-red-400 underline font-mono ml-2 uppercase text-[9px]"
                    >
                      (ቀይር / Log out)
                    </button>
                  </div>
                ) : (
                  <div className="p-2.5 bg-amber-500/5 border border-amber-500/15 rounded-xl text-center text-[10px] text-amber-500">
                    ⚠️ እባክዎ መጀመሪያ የ <strong>PHONE (ስልክ)</strong> ምርጫ ውስጥ በመግባት ስልክ ቁጥርዎን ያስገቡ!
                  </div>
                )}

                {!otpSent ? (
                  <div className="p-3.5 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl text-center space-y-1">
                    <span className="text-[9px] font-mono text-indigo-400 font-bold uppercase tracking-widest block">💳 Instantly Pay via Telebirr</span>
                    <p className="text-[10.5px] text-zinc-450 leading-normal">
                      የቴሌብር የክፍያ ጥያቄ ለመጀመር ከታች ያለውን ሰማያዊ አዝራር ይጫኑ። / Click the button below to initiate instantaneous Telebirr gateway validation.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 bg-[#050505]/40 p-4 border border-cyan-500/10 rounded-2xl animate-pulse">
                    <div className="space-y-1.5 text-center">
                      <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider block">💬 Verification Code Sent!</span>
                      <p className="text-[10.5px] text-zinc-450">
                        ባለ 4-አሃዝ የማረጋገጫ ኮድ (OTP) ወደ <strong className="text-zinc-300 font-mono">{telebirrPhone || currentEmail}</strong> ተልኳል።
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 block text-center font-bold">የኤስኤምኤስ ኮድ ያስገቡ (Enter 4-Digit OTP)</label>
                      <input
                        type="text"
                        maxLength={4}
                        placeholder="- - - -"
                        value={telebirrOtp}
                        onChange={(e) => setTelebirrOtp(e.target.value.replace(/\D/g, ''))}
                        className="w-28 mx-auto bg-zinc-950 border border-zinc-850 rounded-xl py-2.5 text-center text-sm font-bold tracking-[0.4em] font-mono text-cyan-400 placeholder-zinc-800 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={paymentLoading || !currentEmail}
                  className="w-full py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-teal-600/20 flex items-center justify-center gap-2 font-mono"
                >
                  {paymentLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ሂሳቡን በማረጋገጥ ላይ / Authenticating Payment...
                    </>
                  ) : (
                    <>
                      <Smartphone size={14} />
                      {otpSent ? `ክፍያውን አረጋግጥ / Confirm ${targetQuality === '1080p' ? '15,000' : '10,000'} ETB` : `በቴሌብር ይክፈሉ / Pay ${targetQuality === '1080p' ? '15,000' : '10,000'} ETB`}
                    </>
                  )}
                </button>
              </form>
            )}

            {lockTab === 'pay' && !successMessage && (
              <div className="p-4 bg-[#050505] border border-zinc-900 rounded-2xl space-y-3">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono tracking-widest font-semibold text-cyan-400 uppercase block flex items-center gap-1">
                    <Clock size={11} className="animate-spin" style={{ animationDuration: '3s' }} /> ክፍያ ፈጽመዋል? / Already Paid?
                  </span>
                  <p className="text-[10px] text-zinc-400 leading-normal">
                    ለባለቤቱ በቴሌብር ስልክ <strong>0979036932</strong> ሂሳቡን በቀጥታ ልከው ከሆነ፤ የመዳረሻ ፈቃድ መጠየጫ ጥያቄ መላክ ይችላሉ።
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRequestApproval}
                  className="w-full py-2.5 bg-gradient-to-r from-cyan-950 to-zinc-950 hover:from-cyan-900 hover:to-zinc-900 border border-cyan-800/20 hover:border-cyan-700/40 text-cyan-400 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 font-mono"
                >
                  <Send size={11} /> የክፍያ መዳረሻ ጥያቄ ላክ / Submit Access Request
                </button>
              </div>
            )}

            {/* TAB CONTENT: 3. VIP License Key */}
            {lockTab === 'vip' && !successMessage && (
              <form onSubmit={handleVipKeySubmit} className="space-y-4">
                <div className="text-center space-y-1">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest font-mono">Submit VIP Creator Pass</h3>
                  <p className="text-[11px] text-zinc-550">ባለቤቱ በነፃ መግቢያ እንዲፈቅድልዎት የሰጠዎትን ልዩ ቁልፍ እዚህ ያስገቡ።</p>
                </div>

                {currentEmail && (
                  <div className="bg-[#050505] border border-zinc-900 p-2 text-center rounded-xl text-[10px] text-zinc-400 font-mono">
                    {currentEmail.includes('@') ? 'Subscriber Email: ' : 'Subscriber Phone: '}
                    <span className="text-indigo-400">{currentEmail}</span>
                  </div>
                )}

                <div className="relative">
                  <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-650" size={15} />
                  <input
                    type="text"
                    placeholder="Enter key e.g. YOTOR-FREE-AMHARIC-2026"
                    value={vipInput}
                    onChange={(e) => setVipInput(e.target.value)}
                    className="w-full bg-[#050505] border border-zinc-900 rounded-xl py-3 pl-10 pr-4 text-xs font-mono uppercase text-zinc-200 placeholder-zinc-700/80 focus:outline-none focus:border-indigo-500 focus:text-indigo-400 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-zinc-100 hover:bg-white text-stone-950 font-bold text-xs uppercase tracking-widest rounded-xl transition-all font-mono"
                >
                  Apply Passkey Code
                </button>
              </form>
            )}
              </>
            )}

            {/* Footer footer */}
            <div className="pt-2 text-center border-t border-zinc-900">
              <span className="text-[9px] font-mono text-zinc-650 uppercase">Secured by Yotor Gatekeepers Inc. &copy; 2026</span>
            </div>

          </div>
        </div>
      ) : (
        /* Render normal functional application with a premium admin bar */
        <div className="min-h-screen flex flex-col relative">

          {/* Glowing premium badge bar */}
          <div className="bg-[#050505] border-b border-zinc-900 py-2 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs font-mono select-none" id="yotor-vip-badge-bar">
            <div className="flex flex-wrap items-center gap-3">
              <span className="bg-gradient-to-r from-indigo-500 to-violet-500 px-2 py-0.5 text-[8.5px] font-extrabold text-white rounded uppercase tracking-wider animate-pulse flex items-center gap-1">
                <Sparkles size={8} className="fill-current" />
                Yotor Studio
              </span>
              <p className="text-[10px] text-zinc-450 flex flex-wrap items-center gap-1.5">
                <span>ተጠቃሚ (Identity):</span> 
                <span className="text-zinc-200 font-bold">{currentEmail || 'Local Developer Sandbox (Unprotected)'}</span>
                <span className="text-zinc-800">|</span>
                <span>ወርሃዊ እቅድ (Plan):</span>
                <span className={`px-2 py-0.5 rounded text-[8.5px] font-extrabold tracking-wide uppercase ${
                  getActivePlanLabel() === '720p'
                    ? 'bg-teal-500/10 text-teal-400 border border-teal-500/15'
                    : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/15'
                }`}>
                  {getActivePlanLabel() === 'owner' && '1080p Full HD (Master Owner)'}
                  {getActivePlanLabel() === 'whitelist' && '1080p Full HD (Authorized Free)'}
                  {getActivePlanLabel() === '1080p' && '1080p Full HD (Premium 15K ETB)'}
                  {getActivePlanLabel() === '720p' && '720p HD Standard (Core 10K ETB)'}
                </span>

                {/* Inline upgrade button for 720p subscribers */}
                {getActivePlanLabel() === '720p' && (
                  <button
                    type="button"
                    onClick={handleTriggerUpgrade}
                    className="ml-2 px-2 py-0.5 bg-cyan-950/20 hover:bg-cyan-900/40 border border-cyan-850 text-cyan-400 hover:text-cyan-200 rounded font-black uppercase text-[8px] tracking-widest transition-all"
                  >
                    🚀 Upgrade to 1080p
                  </button>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Reset simulator button */}
              <button
                type="button"
                onClick={handleResetSession}
                className="px-2 py-1 bg-zinc-900 border border-zinc-800 text-[9.5px] font-semibold text-zinc-400 hover:text-white rounded-lg transition-colors uppercase tracking-widest"
                title="Log out and return back to paywall gate"
              >
                Log Out / Gate
              </button>

              {/* Master Owner / Admin Toggle Control gear */}
              {(currentEmail.toLowerCase().trim() === MASTER_OWNER || currentEmail.toLowerCase().trim() === BACKUP_OWNER || !isGateActive) && (
                <button
                  type="button"
                  onClick={() => setIsAdminOpen(true)}
                  className="px-2.5 py-1 bg-indigo-600/15 hover:bg-indigo-600 border border-indigo-500/20 hover:border-indigo-500 text-indigo-400 hover:text-white rounded-lg transition-all flex items-center gap-1 text-[9.5px] uppercase tracking-widest font-bold"
                >
                  <Settings size={10} className="animate-spin" style={{ animationDuration: '6s' }} />
                  Admin Board ({whitelist.length + vipKeys.length})
                </button>
              )}
            </div>
          </div>

          {/* Render the full content workspace */}
          {children}

          {/* ADMIN & WHITELIST CONFIGURATION CENTER MODAL */}
          {isAdminOpen && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4" id="yotor-admin-panel">
              <div className="bg-[#0c0c0e] border border-zinc-805 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Visual purple top glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-16 bg-indigo-500/10 rounded-full blur-[40px] pointer-events-none" />

                <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-900">
                  <div className="flex items-center gap-2">
                    <Settings className="text-indigo-400 animate-spin" size={18} style={{ animationDuration: '8s' }} />
                    <h2 className="text-sm font-light uppercase tracking-widest text-[#ececed]">
                      YOTOR CONTROL TOWER / አስተዳዳሪ ሰሌዳ
                    </h2>
                  </div>
                  <button 
                    onClick={() => setIsAdminOpen(false)}
                    className="p-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="space-y-4 overflow-y-auto flex-1 pr-1">
                  
                  {/* Protection state switch */}
                  <div className="p-4 bg-[#050505] rounded-2xl border border-zinc-900 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase block">Global Paywall Security Gate</span>
                      <p className="text-[11px] text-[#8e909a] mt-0.5">When disabled, anyone can enter free without entering emails.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsGateActive(!isGateActive)}
                      className={`px-3 py-1.5 font-mono text-[9px] rounded-xl font-bold uppercase tracking-wider border transition-all ${
                        isGateActive 
                          ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400' 
                          : 'bg-zinc-950 border-zinc-900 text-zinc-500'
                      }`}
                    >
                      {isGateActive ? '● GATE ENABLED' : '○ GATE DISABLED'}
                    </button>
                  </div>

                  {/* PENDING APPROVAL MANUAL REQUESTS (በመጠባበቅ ላይ ያሉ ጥያቄዎች) */}
                  <div className="space-y-2.5">
                    <span className="text-[10px] font-mono tracking-widest font-semibold text-cyan-400 uppercase block flex items-center gap-1.5">
                      <Clock size={11} className="animate-spin text-cyan-400" style={{ animationDuration: '4s' }} /> Waiting Approval Requests ({pendingRequests.length})
                    </span>
                    
                    <div className="bg-[#050505] rounded-2xl border border-zinc-900 p-4 space-y-3">
                      {pendingRequests.length === 0 ? (
                        <p className="text-[10.5px] text-zinc-650 italic text-center py-2 font-mono">
                          ምንም በመጠባበቅ ላይ ያሉ ጥያቄዎች የሉም። / No pending access requests.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-[220px] overflow-y-auto">
                          {pendingRequests.map(phone => (
                            <div key={phone} className="p-3 bg-zinc-950 border border-zinc-900 rounded-xl flex items-center justify-between gap-3 text-left">
                              <div className="space-y-0.5 min-w-0">
                                <span className="text-xs font-mono font-bold text-zinc-200 block truncate">{phone}</span>
                                <span className="text-[8px] font-mono text-zinc-500 uppercase block">ጥያቄ ማቅረቢያ / Manual Request</span>
                              </div>
                              <div className="flex gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const clean = phone.toLowerCase().trim();
                                    const updatedPaid = [...new Set([...unlockedEmails, clean])];
                                    setUnlockedEmails(updatedPaid);
                                    
                                    const updatedPlans = { ...emailPlans, [clean]: '1080p' };
                                    setEmailPlans(updatedPlans);
                                    
                                    setPendingRequests(pendingRequests.filter(p => p !== phone));
                                  }}
                                  className="px-2 py-1 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold transition-all rounded text-[9px] uppercase tracking-wider font-mono"
                                >
                                  Allow FHD
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const clean = phone.toLowerCase().trim();
                                    const updatedWhitelist = [...new Set([...whitelist, clean])];
                                    setWhitelist(updatedWhitelist);
                                    
                                    setPendingRequests(pendingRequests.filter(p => p !== phone));
                                  }}
                                  className="px-2 py-1 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-bold transition-all rounded text-[9px] uppercase tracking-wider font-mono"
                                >
                                  Free
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPendingRequests(pendingRequests.filter(p => p !== phone));
                                  }}
                                  className="p-1 px-1.5 border border-zinc-850 hover:bg-red-500/10 hover:border-red-500 text-zinc-500 hover:text-red-400 transition-all rounded shrink-0"
                                  title="Reject request"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Whitelisted Emails/Phones Management Column */}
                  <div className="space-y-2.5">
                    <span className="text-[10px] font-mono tracking-widest font-semibold text-zinc-500 uppercase block">
                      Free Whitelist Registrations (ፈቃድ የተሰጣቸው ስልኮች/ኢሜይሎች)
                    </span>
                    
                    <div className="bg-[#050505] rounded-2xl border border-zinc-900 p-4 space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Add email or phone e.g. 0912345678"
                          value={newWhitelistEmail}
                          onChange={(e) => setNewWhitelistEmail(e.target.value)}
                          className="flex-1 bg-[#09090b] border border-zinc-800 rounded-xl px-3.5 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={addToWhitelist}
                          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-mono flex items-center gap-1 uppercase tracking-wider"
                        >
                          <Plus size={12} />
                          Add
                        </button>
                      </div>

                      <div className="max-h-[140px] overflow-y-auto border border-zinc-900 rounded-xl divide-y divide-zinc-900 font-mono text-[10px]">
                        {whitelist.map(email => (
                          <div key={email} className="flex items-center justify-between p-2 hover:bg-zinc-950 transition-colors">
                            <span className="text-zinc-400 flex items-center gap-1.5 truncate">
                              <span className={`w-1 h-1 rounded-full ${(email === MASTER_OWNER || email === BACKUP_OWNER) ? 'bg-amber-500 animate-ping' : 'bg-indigo-400'}`} />
                              {email}
                              {(email === MASTER_OWNER || email === BACKUP_OWNER) && <span className="text-[8px] bg-amber-500/10 border border-amber-500/30 text-amber-500 px-1 rounded uppercase">Owner</span>}
                            </span>
                            {email !== MASTER_OWNER && email !== BACKUP_OWNER && (
                              <button
                                type="button"
                                onClick={() => removeFromWhitelist(email)}
                                className="text-zinc-650 hover:text-red-400 transition-colors"
                                title="Remove Email from Free Access"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* VIP license keys creation Center Column */}
                  <div className="space-y-2.5">
                    <span className="text-[10px] font-mono tracking-widest font-semibold text-zinc-500 uppercase block">
                      Active VIP Entry Code Passes (ፈጣን ኮዶች)
                    </span>
                    
                    <div className="bg-[#050505] rounded-2xl border border-zinc-900 p-4 space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="New code e.g. GOLDEN-PASS"
                          value={newVipKey}
                          onChange={(e) => setNewVipKey(e.target.value)}
                          className="flex-1 bg-[#09090b] border border-zinc-800 rounded-xl px-3.5 py-2 text-xs font-mono text-zinc-300 uppercase focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={generateNewVipKey}
                          className="px-3 py-2 bg-zinc-200 hover:bg-white text-stone-900 rounded-xl text-xs font-mono font-bold flex items-center gap-1 uppercase tracking-wider"
                        >
                          <Plus size={12} />
                          Create
                        </button>
                      </div>

                      <div className="max-h-[140px] overflow-y-auto border border-zinc-900 rounded-xl divide-y divide-zinc-900 font-mono text-[10px]">
                        {vipKeys.map(key => (
                          <div key={key} className="flex items-center justify-between p-2 hover:bg-zinc-950 transition-colors">
                            <span className="text-indigo-400 font-bold tracking-wider flex items-center gap-1.5 uppercase">
                              <Key size={10} />
                              {key}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeVipKey(key)}
                              className="text-zinc-650 hover:text-red-400 transition-colors"
                              title="Delete VIP Key code"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>

                <div className="pt-3.5 mt-4 border-t border-zinc-900 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsAdminOpen(false)}
                    className="px-5 py-2 bg-zinc-900 hover:bg-zinc-850 hover:text-white border border-zinc-800 text-zinc-400 text-xs rounded-xl uppercase tracking-widest font-mono transition-colors"
                  >
                    Close Control Panel
                  </button>
                </div>

              </div>
            </div>
          )}

        </div>
      )}
    </>
  );
}
