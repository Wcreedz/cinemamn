// Frontend болон backend хооронд хуваалцах API-н төрлүүд. Зөвхөн `import type`-аар ашиглана.
export type UserRole = 'user' | 'admin' | 'superadmin';
export type UserStatus = 'active' | 'blocked';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';
export type SubscriptionStatus = 'pending' | 'active' | 'expired' | 'cancelled';
export type VideoStatus = 'none' | 'uploading' | 'queued' | 'processing' | 'ready' | 'failed';
export type QPayEnvironment = 'sandbox' | 'production';

export interface ApiError { error: { code: string; message: string; details?: unknown } }
export interface Paginated<T> { items: T[]; total: number; page: number; limit: number; pages: number }

export interface PublicUser {
  id: string; phone: string; email?: string; name: string; role: UserRole; status: UserStatus;
  createdAt: string; lastLoginAt?: string;
}

export interface Category { id: string; name: string; slug: string; description?: string; image?: string; sortOrder: number; isActive: boolean }

export interface MovieSummary {
  id: string; title: string; slug: string; poster?: string; backdrop?: string; description?: string;
  releaseYear?: number; duration?: number; genres: Category[]; featured: boolean; viewCount: number;
}
export interface MovieDetail extends MovieSummary {
  originalTitle?: string; trailerUrl?: string; cast: string[]; director?: string; language?: string; country?: string;
  videoStatus: VideoStatus;
}
export interface AdminMovie extends MovieDetail { isPublished: boolean; videoError?: string; videoRetryable?: boolean; hlsPath?: string; createdAt: string; updatedAt: string }

export interface Plan { code: string; name: string; price: number; currency: string; durationDays: number; enabled: boolean }
export interface PlansResponse { enabled: boolean; paymentRequired: boolean; currency: string; plans: Plan[]; version: number }

export interface SubscriptionView {
  id: string; planCode: string; amount: number; currency: string; status: SubscriptionStatus;
  startedAt: string; expiresAt: string; createdAt: string;
}
export interface SubscriptionMe { hasAccess: boolean; paymentRequired: boolean; expiresAt: string | null; current: SubscriptionView | null }

export interface PaymentView {
  id: string; orderNumber: string; planCode: string; planName: string; amount: number; currency: string; status: PaymentStatus;
  failureReason?: string; paidAt?: string; createdAt: string; expiresAt?: string;
  qr?: { image?: string; text?: string; shortUrl?: string; urls: { name: string; description?: string; logo?: string; link: string }[] };
}

export interface HeroBanner { title: string; subtitle?: string; image?: string; link?: string; enabled: boolean }
export interface HomeSection { key: string; title: string; type: 'new' | 'popular' | 'continue' | 'category'; categorySlug?: string; visible: boolean; order: number }
export interface PublicSettings {
  general: { siteName: string; logo?: string; favicon?: string; description: string; maintenanceMode: boolean };
  homepage: { heroBanners: HeroBanner[]; featuredMovieIds: string[]; sections: HomeSection[] };
  subscription: { enabled: boolean; paymentRequired: boolean; currency: string };
}

export interface WatchHistoryItem { movie: MovieSummary; progressSeconds: number; durationSeconds: number; completed: boolean; lastWatchedAt: string }
export interface PlaybackGrant { manifestUrl: string; expiresAt: string; resumeSeconds: number }
