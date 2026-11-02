declare module 'quickqpaypackv2' {
  export const QpayKhariltsagch: (conn: { kholbolt: unknown }) => any;
  export const QuickQpayObject: (conn: { kholbolt: unknown }) => any;
  export function qpayGargaya(body: Record<string, unknown>, callbackUrl: string, conn: { kholbolt: unknown }): Promise<any>;
  export function qpayShalgay(body: Record<string, unknown>, conn: { kholbolt: unknown }): Promise<any>;
}
