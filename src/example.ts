import 'core-js';
import { Subscription } from 'rxjs';

import { pollerManager } from './PollerManager';

const poolInfoBoard = document.querySelector('#poller-pool-info');
const poller1Display = document.querySelector('#poller1');
const poller2Display = document.querySelector('#poller2');

const subscriptions: Subscription[] = [];
const peekSub: Subscription = pollerManager.peek.subscribe(
  (change) => {
    if (poolInfoBoard) {
      console.info(change);

      try {
        poolInfoBoard.innerHTML = JSON.stringify(change, null, 2)
      } catch (err) {
        console.warn(err);
        console.info('in catch block', change);
      }
    }
  }
);

const poller1$ = pollerManager.get(
  'https://public-api.adsbexchange.com/VirtualRadar/AircraftList.json?lat=33.433638&lng=-112.008113&fDstL=0&fDstU=100',
  10000,
);
const poller2$ = pollerManager.get(
  'https://public-api.adsbexchange.com/VirtualRadar/AircraftList.json?lat=33.433638&lng=-112.008113&fDstL=0&fDstU=100',
  3000,
);

subscriptions.push(
  poller1$.subscribe(
    (next: any) => poller1Display && (poller1Display.innerHTML = JSON.stringify(next, null, 2)),
  ),
);

subscriptions.push(
  poller2$.subscribe(
    (next: any) => poller2Display && (poller2Display.innerHTML = JSON.stringify(next, null, 2)),
  ),
);

setTimeout(() => {
  subscriptions[1].unsubscribe();
  subscriptions.splice(1);  
}, 15000);

setTimeout(() => {
  subscriptions[0].unsubscribe();
  subscriptions.splice(0);
}, 30000);

setTimeout(() => {
  subscriptions.push(
    poller2$.subscribe(
      (next: any) => poller2Display && (poller2Display.innerHTML = JSON.stringify(next, null, 2)),
    ),
  );
}, 40000);

setTimeout(() => {
  subscriptions.forEach((sub) => sub.unsubscribe());
}, 55000);
