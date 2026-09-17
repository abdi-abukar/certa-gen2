// Decorative, code-native companions to the five village landmarks.
const landmarks = [
  <g key="cottage"><path d="m44 104 66-54 66 54M56 96v68h108V96M92 164v-40a18 18 0 0 1 36 0v40M65 82V58h18v10" /><path d="M68 112h12v18H68zm72 0h12v18h-12zM102 143h2" /></g>,
  <g key="board"><path d="M58 78h104v76H58zM50 78l10-18h100l10 18M70 154v18m80-18v18M78 99h64M78 114h46M78 129h56" /><path d="m135 119 9 9 20-23" /></g>,
  <g key="workbench"><path d="M46 76h128l-8 24H54zM58 76v96m104-96v96M50 138h120M70 138v34m80-34v34M81 121l19-19 9 9-19 19zM128 110v28m-10-28h20" /><path d="M54 100q12 12 24 0 12 12 24 0 12 12 24 0 12 12 24 0 8 8 16 0" /></g>,
  <g key="fountain"><ellipse cx="110" cy="155" rx="63" ry="18" /><path d="M47 155v14q63 32 126 0v-14M94 147l8-53h16l8 53M83 96q27 19 54 0M110 75v-8M75 112q0-31 28-25m42 25q0-31-28-25M66 133v-8m88 8v-8" /><circle cx="110" cy="57" r="10" /></g>,
  <g key="telescope"><path d="m75 100 69-30 10 24-69 30zM143 68l12-5 14 32-12 5M74 103l-12 5 7 17 12-5M112 114v48m0-32-30 40m30-40 30 40" /><path d="m160 44 3-9 3 9 9 3-9 3-3 9-3-9-9-3zM62 66v-8m-4 4h8" /></g>,
];

export function VillageGraphic({ index, className }: { index: number; className: string }) {
  return <svg className={className} viewBox="0 0 220 220" fill="none" aria-hidden="true">
    <circle cx="110" cy="110" r="103" fill="currentColor" fillOpacity=".035" stroke="currentColor" strokeOpacity=".2" />
    <circle cx="110" cy="110" r="91" stroke="currentColor" strokeOpacity=".12" strokeDasharray="2 8" />
    <path d="m30 156 24-33 20 18m77 10 17-22 23 30M43 183h134" stroke="currentColor" strokeOpacity=".25" />
    <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{landmarks[index]}</g>
  </svg>;
}
