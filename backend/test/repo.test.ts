import { execFileSync } from 'child_process';
import path from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const SOURCE_DIRS = ['frontend/app', 'frontend/components', 'frontend/hooks', 'frontend/lib', 'backend/src', 'shared'];

describe('repo', () => {
  // .gitignore-ийн хэт өргөн мөр эх кодыг алгасвал локалд ажиллаад, GitHub/Vercel дээр алга болдог.
  it('эх кодын файл .gitignore-д баригдахгүй', () => {
    const ignored = execFileSync('git', ['ls-files', '-i', '-o', '--exclude-standard', '--', ...SOURCE_DIRS], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && !f.split('/').some((part) => ['node_modules', 'dist', '.next'].includes(part)));
    expect(ignored).toEqual([]);
  });
});
