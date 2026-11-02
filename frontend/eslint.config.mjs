import next from 'eslint-config-next';

const config = [
  ...next,
  {
    rules: {
      // Постер/лого нь админы тохируулсан дурын хостоос ирдэг тул next/image-ийн хост жагсаалтад багтахгүй.
      '@next/next/no-img-element': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  { ignores: ['.next/', 'next-env.d.ts'] },
];
export default config;
