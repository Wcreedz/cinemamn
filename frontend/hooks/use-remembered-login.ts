'use client';
import { useEffect, useState } from 'react';

// Зөвхөн нэвтрэх нэрийг (утас эсвэл имэйл) энэ хөтөчид хадгална. Нууц үг хэзээ ч хадгалагдахгүй.
// localStorage хаалттай хөтөчид зүгээр л санахгүй: нэвтрэлтэд нөлөөлөх ёсгүй.
export function useRememberedLogin(key: string) {
  const [login, setLogin] = useState('');
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) { setLogin(saved); setRemember(true); }
    } catch { /* localStorage хаалттай */ }
  }, [key]);

  // Амжилттай нэвтэрсний дараа дуудна: буруу оруулсан утгыг хадгалахгүй, тэмдэглээгүй бол арилгана.
  const saveLogin = () => {
    try {
      if (remember) localStorage.setItem(key, login.trim());
      else localStorage.removeItem(key);
    } catch { /* localStorage хаалттай */ }
  };

  return { login, setLogin, remember, setRemember, saveLogin };
}
