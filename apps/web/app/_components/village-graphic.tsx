// Decorative topic icons; independent of the moving village's landmark order.
const graphics = {
  about: <><path d="m6 48 18-30 10 17 7-11 17 24H6Z" /><path d="m18 28 6 4 6-4M24 18V8h13l-4 5 4 5H24" /></>,
  transparency: <><path d="M32 6 52 14v15c0 14-10 23-20 29C22 52 12 43 12 29V14L32 6Z" /><path d="m22 31 7 7 14-15" /></>,
  community: <><path d="M7 10h36v28H22L11 47v-9H7V10Z" /><path d="M43 21h14v28h-7v8l-11-8H28V38M17 20h16M17 28h11" /></>,
  affiliates: <><path d="m9 26 33-13v34L9 34v-8ZM42 13h7v34h-7M18 38l4 17h10l-6-14M9 27H5v6h4M55 20l5-4M55 30h7M55 40l5 4" /></>,
  rewards: <><path d="M8 25h48v11H8zM12 36v21h40V36M32 25v32" /><path d="M32 25H21a8 8 0 1 1 8-10l3 10Zm0 0h11a8 8 0 1 0-8-10l-3 10Z" /></>,
};

export function VillageGraphic({ kind, className }: { kind: keyof typeof graphics; className: string }) {
  return <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{graphics[kind]}</g>
  </svg>;
}
