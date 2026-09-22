// 사용법: node compare-formats.mjs scene.ply
// scene.ply(3DGS 학습 결과 원본)를 받아 .compressed.ply / .sog / .spz 로 각각 변환하고,
// 형식별 파일 크기 / 변환 시간 / 알갱이 개수 / 알갱이당 바이트를 표로 뽑는다.
// npx로만 실행하므로 @playcanvas/splat-transform 을 따로 설치할 필요는 없다.

import { execFileSync } from 'node:child_process';
import { statSync, existsSync } from 'node:fs';
import { basename } from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('사용법: node compare-formats.mjs <scene.ply>');
  process.exit(1);
}

// Windows에서는 npx가 npx.cmd라 cmd.exe를 거쳐야 한다. cmd /c 를 앞에 붙이면
// shell:true 없이도 배열 인자를 그대로 안전하게 전달할 수 있다.
const [CMD, PREFIX] = process.platform === 'win32' ? ['cmd', ['/c', 'npx']] : ['npx', []];

function run(args) {
  return execFileSync(CMD, [...PREFIX, '-y', '@playcanvas/splat-transform@latest', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function getCount(file) {
  const out = run([file, '--info', 'json', 'null']);
  const info = JSON.parse(out);
  // splat-transform v3.5.1 기준 필드명: numGaussians (버전이 바뀌면 몇 가지 대안도 시도)
  const guess =
    info.numGaussians ??
    info.numSplats ??
    info.count ??
    (Array.isArray(info.lodCounts) ? info.lodCounts.reduce((s, n) => s + n, 0) : null);
  if (guess == null) {
    console.error(`[알림] ${file} 의 알갱이 개수를 자동으로 못 찾았습니다. 원본 --info 출력:`);
    console.error(out);
  }
  return guess;
}

const targets = [
  { label: '.ply', file: input, isSource: true },
  { label: '.compressed.ply', file: input.replace(/\.ply$/, '.compressed.ply') },
  { label: '.sog', file: input.replace(/\.ply$/, '.sog') },
  { label: '.spz', file: input.replace(/\.ply$/, '.spz') },
];

const rows = [];

for (const t of targets) {
  let elapsedMs = null;
  const alreadyExists = !t.isSource && existsSync(t.file) && statSync(t.file).size > 0;
  if (!t.isSource && !alreadyExists) {
    const start = Date.now();
    run(['-w', input, t.file]);
    elapsedMs = Date.now() - start;
  }
  const size = statSync(t.file).size;
  let count = null;
  try {
    count = getCount(t.file);
  } catch (e) {
    console.error(`[경고] ${t.file} 알갱이 개수 조회 실패: ${e.message}`);
  }
  rows.push({
    format: t.label,
    file: basename(t.file),
    sizeBytes: size,
    seconds: elapsedMs == null ? null : (elapsedMs / 1000).toFixed(2),
    count,
    bytesPerSplat: count ? (size / count).toFixed(2) : null,
  });
}

console.log('\n| 형식 | 파일 | 크기(바이트) | 변환 시간(초) | 알갱이 개수 | 알갱이당 바이트 |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(
    `| ${r.format} | ${r.file} | ${r.sizeBytes.toLocaleString()} | ${r.seconds ?? '-'} | ${r.count ?? '?'} | ${r.bytesPerSplat ?? '?'} |`
  );
}

const counts = rows.map((r) => r.count).filter((c) => c != null);
const allSame = counts.every((c) => c === counts[0]);
console.log('\n' + (allSame
  ? '✅ 네 파일의 알갱이 개수가 모두 같습니다.'
  : '⚠️ 알갱이 개수가 형식마다 다릅니다 — 솎아 낸(decimate) 파일과 바뀐 것은 아닌지 확인하세요.'));
