// QPay-ээс ирэх банкны холбоос нь `khanbank://q?qPay_QRcode=...` гэх мэт custom scheme байдаг.
// Android дээр өөр апп ч тухайн scheme-ийг бүртгүүлсэн бол (жишээ нь e-barimt нь `khanbank://`-г
// бүртгүүлсэн) систем "Open with" гэж сонголт асуудаг. Android-ийн `intent://` холбоост package
// заавал систем шууд тэр аппыг нээнэ; апп суугаагүй бол Play Store дээрх хуудсыг нь нээнэ.
//
// АНХААР: package нэр буруу бол хэрэглэгч Play Store руу шилжиж төлбөр эвдэрнэ. Тиймээс зөвхөн
// бодит утсан дээр баталгаажуулсан package-ийг энд нэмнэ (Play Store холбоосын `id=` утга).
export const ANDROID_BANK_PACKAGES: Readonly<Record<string, string>> = {
  khanbank: 'com.khanbank.retail',
};

// `scheme://rest` хэлбэрийн холбоосыг Android intent болгоно. Мэдэгдэхгүй scheme, Android биш
// төхөөрөмж, эсвэл intent-ийг эвдэх `#` тэмдэгт агуулсан бол анхны холбоосыг өөрчлөхгүй буцаана.
export function toBankAppLink(link: string, isAndroid: boolean): string {
  if (!isAndroid) return link;
  const match = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(link);
  if (!match) return link;
  const scheme = match[1].toLowerCase();
  const rest = match[2];
  const pkg = ANDROID_BANK_PACKAGES[scheme];
  if (!pkg || rest.includes('#')) return link;
  return `intent://${rest}#Intent;scheme=${scheme};package=${pkg};end`;
}

export function isAndroidUserAgent(ua: string): boolean {
  return /android/i.test(ua);
}

// Facebook / Messenger / Instagram-ийн доторх хөтөч. Эдгээр нь өөр апп нээхээс өмнө өөрсдийн
// англи "You're leaving our app" цонхыг гаргадаг бөгөөд текстийг нь вэбээс өөрчлөх боломжгүй.
export function isInAppBrowserUserAgent(ua: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram/i.test(ua);
}
