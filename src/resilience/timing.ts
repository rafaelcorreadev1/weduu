import { setTimeout as delay } from 'node:timers/promises';

export type Sleep = (ms: number) => Promise<void>;
export type Now = () => number;

export const realSleep: Sleep = (ms) => delay(ms);
export const realNow: Now = () => Date.now();
