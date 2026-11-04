import { SiteVisit } from '../models';

const DUPLICATE_KEY = 11000;
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar', year: 'numeric', month: '2-digit', day: '2-digit' });

// Серверийн цагийн бүсээс хамаарахгүй: "өнөөдөр" нь Монголын цагаар шөнө дунд солигдоно.
export const visitDay = (date: Date) => dayFormat.format(date);

const uniqueVisitors = async (match: Record<string, unknown>) => {
  const [row] = await SiteVisit.aggregate<{ count: number }>([{ $match: match }, { $group: { _id: '$visitorId' } }, { $count: 'count' }]);
  return row?.count ?? 0;
};

export const VisitService = {
  async record(visitorId: string) {
    try {
      await SiteVisit.updateOne({ day: visitDay(new Date()), visitorId }, {}, { upsert: true, setDefaultsOnInsert: true });
    } catch (e) {
      // Зэрэг ирсэн хүсэлт аль хэдийн бичсэн: зорилго биелсэн.
      if ((e as { code?: number }).code !== DUPLICATE_KEY) throw e;
    }
  },

  async counts(now: Date) {
    const today = visitDay(now);
    const [todayCount, month, total] = await Promise.all([
      SiteVisit.countDocuments({ day: today }),
      uniqueVisitors({ day: { $gte: `${today.slice(0, 7)}-01` } }),
      uniqueVisitors({}),
    ]);
    return { today: todayCount, month, total };
  },
};
