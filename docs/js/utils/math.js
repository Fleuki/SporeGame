export function dist(x1,y1,x2,y2){ return Math.hypot(x2-x1,y2-y1); }
export function rand(min,max){ return Math.random()*(max-min)+min; }
export function clamp(val,min,max){ return Math.max(min,Math.min(max,val)); }
export function angleTo(x1,y1,x2,y2){ return Math.atan2(y2-y1,x2-x1); }