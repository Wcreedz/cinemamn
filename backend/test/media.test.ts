import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { env } from '../src/config/env';
import { Category, Movie, SystemSetting } from '../src/models';
import { defaults } from '../src/services/settings.service';
import { api, login, makeMovie, resetDb, startDb, stopDb } from './helpers';

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const attachment = { filename: 'a.png', contentType: 'image/png' };
const onDisk = (url: string) => path.join(env.VIDEO_DEFAULT_ROOT, url.replace('/media/', ''));
const exists = (url: string) => fs.access(onDisk(url)).then(() => true, () => false);
const fields = (m: { title: string }, over: Record<string, unknown> = {}) => ({ title: m.title, isPublished: true, ...over });

describe('Зураг: солих, устгах, ангилал, нүүр хуудас', () => {
  beforeAll(startDb);
  afterAll(async () => { await fs.rm(env.VIDEO_DEFAULT_ROOT, { recursive: true, force: true }); await stopDb(); });
  beforeEach(resetDb);

  async function posterOf(movieId: unknown, agent: Awaited<ReturnType<typeof login>>['agent']) {
    const res = await agent.post(`/api/admin/movies/${movieId}/image?kind=poster`).attach('image', png, attachment);
    expect(res.status).toBe(200);
    return res.body.url as string;
  }

  it('киноны зургийг устгаад зураггүй хадгална, файл нь дискнээс арилна', async () => {
    const m = await makeMovie();
    const { agent } = await login('admin');
    const url = await posterOf(m._id, agent);
    expect((await agent.put(`/api/admin/movies/${m._id}`).send(fields(m, { poster: '' }))).status).toBe(200);
    expect((await Movie.findById(m._id).lean())!.poster).toBeUndefined();
    expect((await api().get(`/api/movies/${m.slug}`)).body.poster).toBeUndefined();
    expect(await exists(url)).toBe(false);
  });

  it('зураг заагаагүй засвар зургийг хөндөхгүй', async () => {
    const m = await makeMovie();
    const { agent } = await login('admin');
    const url = await posterOf(m._id, agent);
    await agent.put(`/api/admin/movies/${m._id}`).send(fields(m));
    expect((await Movie.findById(m._id).lean())!.poster).toBe(url);
    expect(await exists(url)).toBe(true);
  });

  it('зураг солиход хуучин файл дискэнд үлдэхгүй', async () => {
    const m = await makeMovie();
    const { agent } = await login('admin');
    const first = await posterOf(m._id, agent);
    const second = await posterOf(m._id, agent);
    expect(second).not.toBe(first);
    expect(await exists(first)).toBe(false);
    expect(await exists(second)).toBe(true);
  });

  it('бүтэн хаягаар хадгалсан ижил зургийг шинэ гэж андуурч устгахгүй', async () => {
    const m = await makeMovie();
    const { agent } = await login('admin');
    const url = await posterOf(m._id, agent);
    await Movie.updateOne({ _id: m._id }, { $set: { poster: `http://103.0.0.1${url}` } });
    await agent.put(`/api/admin/movies/${m._id}`).send(fields(m, { poster: url }));
    expect(await exists(url)).toBe(true);
  });

  it('зам тойрох оролдлого өөр файлд хүрэхгүй', async () => {
    const secret = path.join(env.VIDEO_DEFAULT_ROOT, 'originals', 'keep.mp4');
    await fs.mkdir(path.dirname(secret), { recursive: true });
    await fs.writeFile(secret, 'x');
    const m = await makeMovie({ poster: '/media/posters/../originals/keep.mp4' });
    const { agent } = await login('admin');
    expect((await agent.put(`/api/admin/movies/${m._id}`).send(fields(m, { poster: '' }))).status).toBe(200);
    await fs.access(secret);
  });

  it('кино устгахад зургууд нь дискнээс арилна', async () => {
    const m = await makeMovie();
    const { agent } = await login('admin');
    const url = await posterOf(m._id, agent);
    expect((await agent.delete(`/api/admin/movies/${m._id}`)).status).toBe(200);
    expect(await exists(url)).toBe(false);
  });

  it('ангиллын зураг: нэмэх, нийтэд харагдах, солих, устгах', async () => {
    const c = await Category.create({ name: 'Драм', slug: 'drama' });
    const { agent } = await login('admin');
    const base = { name: 'Драм', slug: 'drama' };
    const send = () => agent.post(`/api/admin/categories/${c._id}/image`).attach('image', png, attachment);
    expect((await agent.post(`/api/admin/categories/${c._id}/image`).attach('image', Buffer.from('<script>'), attachment)).status).toBe(400);
    const first = (await send()).body.url as string;
    expect(first).toMatch(/^\/media\/backdrops\/categories\/.+\.png$/);
    expect((await api().get(first)).status).toBe(200);
    expect((await api().get('/api/categories')).body.items[0].image).toBe(first);
    await agent.put(`/api/admin/categories/${c._id}`).send(base);
    expect((await Category.findById(c._id).lean())!.image).toBe(first);
    const second = (await send()).body.url as string;
    expect(await exists(first)).toBe(false);
    await agent.put(`/api/admin/categories/${c._id}`).send({ ...base, image: '' });
    expect((await Category.findById(c._id).lean())!.image).toBeUndefined();
    expect(await exists(second)).toBe(false);
    const third = (await send()).body.url as string;
    await agent.delete(`/api/admin/categories/${c._id}`);
    expect(await exists(third)).toBe(false);
  });

  it('ангилал: slug нэрээс автоматаар, давхцвал дугаартай, шинэ нь сүүлд жагсана', async () => {
    await Category.create({ name: 'Драм', slug: 'drama', sortOrder: 5 });
    const { agent } = await login('admin');
    const first = await agent.post('/api/admin/categories').send({ name: 'Монгол кино' });
    const second = await agent.post('/api/admin/categories').send({ name: 'Монгол кино' });
    expect([first.status, second.status]).toEqual([201, 201]);
    const a = (await Category.findById(first.body.id).lean())!;
    const b = (await Category.findById(second.body.id).lean())!;
    expect([a.slug, b.slug]).toEqual(['mongol-kino', 'mongol-kino-2']);
    expect([a.sortOrder, b.sortOrder]).toEqual([6, 7]);
  });

  it('ангилал засахад slug, дараалал хэвээр: холбоос, нүүрний хэсэг эвдрэхгүй', async () => {
    const c = await Category.create({ name: 'Драм', slug: 'drama', sortOrder: 5 });
    const { agent } = await login('admin');
    expect((await agent.put(`/api/admin/categories/${c._id}`).send({ name: 'Шинэ нэр', isActive: true })).status).toBe(200);
    const after = (await Category.findById(c._id).lean())!;
    expect([after.name, after.slug, after.sortOrder]).toEqual(['Шинэ нэр', 'drama', 5]);
  });

  it('эрхгүй хүн зураг байршуулж чадахгүй', async () => {
    const c = await Category.create({ name: 'Драм', slug: 'drama' });
    const viewer = await login();
    expect((await viewer.agent.post(`/api/admin/categories/${c._id}/image`).attach('image', png, attachment)).status).toBe(403);
    expect((await viewer.agent.post('/api/admin/banners/image').attach('image', png, attachment)).status).toBe(403);
    expect((await api().post('/api/admin/banners/image').attach('image', png, attachment)).status).toBe(401);
  });

  it('слайд, зар: зөвхөн идэвхтэй нь нийтэд гарна, хасагдсан файл устана', async () => {
    const { agent } = await login('admin');
    const upload = async () => (await agent.post('/api/admin/banners/image').attach('image', png, attachment)).body.url as string;
    const [slide, hidden, ad] = [await upload(), await upload(), await upload()];
    expect(slide).toMatch(/^\/media\/backdrops\/banners\/.+\.png$/);
    const value = {
      ...defaults().homepage,
      heroBanners: [{ title: '', image: slide, link: '/movies/kino', enabled: true }, { title: 'Нуугдсан', image: hidden, enabled: false }],
      adBanners: [{ image: ad, link: 'https://example.com/zar', enabled: true }],
    };
    expect((await agent.put('/api/admin/settings/homepage').send({ value })).status).toBe(200);
    const pub = (await api().get('/api/settings/public')).body.homepage;
    expect(pub.heroBanners.map((b: { image: string }) => b.image)).toEqual([slide]);
    expect(pub.adBanners.map((b: { image: string }) => b.image)).toEqual([ad]);

    const next = { ...value, heroBanners: [value.heroBanners[0]], adBanners: [] };
    expect((await agent.put('/api/admin/settings/homepage').send({ value: next })).status).toBe(200);
    expect(await exists(slide)).toBe(true);
    expect(await exists(hidden)).toBe(false);
    expect(await exists(ad)).toBe(false);
  });

  it('слайд, зарын буруу утгыг татгалзана', async () => {
    const { agent } = await login('admin');
    const put = (over: Record<string, unknown>) => agent.put('/api/admin/settings/homepage').send({ value: { ...defaults().homepage, ...over } });
    expect((await put({ heroBanners: [{ title: '', enabled: true }] })).status).toBe(400);
    expect((await put({ heroBanners: [{ title: 'А', link: 'javascript:alert(1)', enabled: true }] })).status).toBe(400);
    expect((await put({ adBanners: [{ enabled: true }] })).status).toBe(400);
    expect((await put({ adBanners: [{ image: 'javascript:alert(1)', enabled: true }] })).status).toBe(400);
  });

  it('зарын талбар нэмэгдэхээс өмнө хадгалсан тохиргоо эвдрэхгүй', async () => {
    const { adBanners: _dropped, ...old } = defaults().homepage;
    await SystemSetting.create({ key: 'homepage', value: old, version: 3 });
    const { body, status } = await api().get('/api/settings/public');
    expect(status).toBe(200);
    expect(body.homepage.adBanners).toEqual([]);
    const { agent } = await login('admin');
    expect((await agent.get('/api/admin/settings')).body.homepage.value.adBanners).toEqual([]);
  });
});
