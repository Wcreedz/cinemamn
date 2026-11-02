'use client';
import { useEffect, useState } from 'react';

// Банкны апп-ын холбоос зөвхөн гар утсан дээр нээгддэг тул дэлгэцийн өргөн биш, төхөөрөмжөөр шийднэ.
// Хөтөч дээр шалгах хүртэл null: сервер ба хөтчийн зураглал зөрөхгүй.
export function useIsMobile() {
  const [mobile, setMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
    // iPadOS өөрийгөө Mac гэж танилцуулдаг тул мэдрэгчтэй дэлгэцээр нь ялгана.
    const iPad = /Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1;
    setMobile(nav.userAgentData?.mobile === true || iPad || /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent));
  }, []);
  return mobile;
}
