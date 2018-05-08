import { Observable, BehaviorSubject, timer, onErrorResumeNext, Subscription, defer } from 'rxjs';
import { tap, filter, map, switchMap, mergeMapTo, publish, refCount, throttleTime, finalize } from 'rxjs/operators';
import { ajax } from 'rxjs/ajax';

import { PriorityQueue } from './PriorityQueue';

class PollerManager {
  private static IdlePollerTTL = 10000; // The longest time an idle polling source can live before being deleted
  private static GhostKey = Symbol('Ghost Poller key'); // Key of the initial dummy payload of this.intervalChanger$
  private static DefautMinInterval = Number.POSITIVE_INFINITY; // Value of the initial dummy payload of this.intervalChanger$
  private static poolChange = new BehaviorSubject<any>({action: '__INIT__'}); // An event emitter for outside observing criticle interal changes of the manager
  private static counter = 0; // Total number of PollerManager instances

  private sources: {
    [srcPollerKey: string]: Observable<any>;
  } = {}; // A list of unique polling source
  private minIntervals: {
    [srcPollerKey: string]: PriorityQueue<number>;
  } = {}; // A list of registered polling intervals from each subscription of each unique polling source
  private sourceReapers: {
    [srcPollerKey: string]: number;
  } = {}; // A list of handlers of timers that remove the idle polling sources
  private subCounter: {
    [srcPollerKey: string]: number;
  } = {}; // Total subscriptions of each polling source.
  private intervalChanger$ = new BehaviorSubject<{
    key: string | symbol;
    value: number;
  }>({
    key: PollerManager.GhostKey,
    value: PollerManager.DefautMinInterval,
  }); // A message channel that emits event updating the polling interval of polling sources.
  private id: string; // This PollerManager instance id.

  constructor() {
    PollerManager.counter++;
    this.id = `pool-${PollerManager.counter}`;

    // In development mode, emit a PollerManager creation event.
    process.env.NODE_ENV === 'development' && PollerManager.poolChange.next({
      action: 'create PollerManager',
      internals: {
        id: this.id,
        sources: {
          ...this.getInsights(this.sources)
        },
        pollingIntervals: {
          ...this.getInsights(this.minIntervals),
          inUse: Object.values(this.minIntervals).map((intervals) => intervals.peek())
        },
      }
    });
  }

  public get = (url: string, interval: number) =>
    defer(() => {
      const srcKey = `GET ${url}`;

      this.cancelScheduledReaper(srcKey);
      this.createPollingSrcIfNotExist(srcKey, url);

      this.updatePollingSrcTimeInterval(srcKey, interval, true);
      this.updateSubscriptionCount(srcKey, 'inc');

      return this.sources[srcKey].pipe(
        throttleTime(interval),
        finalize(() => {
          this.updatePollingSrcTimeInterval(srcKey, interval, false);
          this.updateSubscriptionCount(srcKey, 'dec');

          if (this.subCounter[srcKey] === 0) {
            this.scheduleReaper(srcKey);
          }
        }),
      );
    });

  public get peek() {
    return PollerManager.poolChange;
  }

  private cancelScheduledReaper = (srcKey: string) => {
    // Incomming subscriber, cancel scheduled polling source reaper.
    if (srcKey in this.sourceReapers) {
      clearTimeout(this.sourceReapers[srcKey]);
      delete this.sourceReapers[srcKey];

      // In development mode, emit a source repeat cancellation event
      process.env.NODE_ENV === 'development' && PollerManager.poolChange.next({
        action: 'cancel scheduled polling source reaper',
        internals: {
          sourceReapers: {
            scheduledToRemove: srcKey,
            isCancelledSuccessfully: Object.keys(this.sourceReapers).every((key) => key !== srcKey),
            ...this.getInsights(this.sourceReapers)
          },
          sources: {
            ...this.getInsights(this.sources),
          },
          pollingIntervals: {
            ...this.getInsights(this.minIntervals),
            inUse: Object.values(this.minIntervals).map((intervals) => intervals.peek())
          },
        }
      });

      return true;
    }

    return false;
  }

  private createPollingSrcIfNotExist = (srcKey: string, url: string) => {
    // Create non-exist polling source
    if (!this.sources[srcKey]) {
      this.sources[srcKey] = this.intervalChanger$.pipe(
        filter(({key}) => key === srcKey),
        switchMap(({value}) => timer(0, value)),
        mergeMapTo(onErrorResumeNext(
          ajax(url).pipe(map(({response}) => response)),
        )),
        publish(),
        refCount(),
      );

      PollerManager.poolChange.next({
        action: 'create new polling source',
        context: {
          srcKey,
          url,
        },
        sources: {
          ...this.getInsights(this.sources),
        },
        pollingIntervals: {
          ...this.getInsights(this.minIntervals),
          inUse: Object.values(this.minIntervals).map((intervals) => intervals.peek())
        }
      });

      return true;
    }

    return false;
  }

  private updatePollingSrcTimeInterval = (srcKey: string, interval: number, isAdd: boolean) => {
    let currPollingSrcInterval;
    let newPollingSrcInterval = interval;

    if (isAdd) {
      // Update polling source's polling interval
      if (!this.minIntervals[srcKey]) {
        this.minIntervals[srcKey] =  new PriorityQueue();
  
        PollerManager.poolChange.next({
          action: 'create polling source intervals entry',
          context: {
            srcKey,
            initialInterval: interval,
          },
          sources: {
            ...this.getInsights(this.sources),
          },
          pollingIntervals: {
            ...this.getInsights(this.minIntervals),
            inUse: Object.values(this.minIntervals).map((intervals) => intervals.peek())
          }
        });
      }
  
      currPollingSrcInterval = this.minIntervals[srcKey].peek();
      this.minIntervals[srcKey].add(interval, interval);
    } else {
      const minIntervals = this.minIntervals[srcKey];
      currPollingSrcInterval = minIntervals.peek();
      minIntervals.remove(interval);
      newPollingSrcInterval = minIntervals.peek() as number;
    }

    if (
      (isAdd && (!currPollingSrcInterval || currPollingSrcInterval > interval))
      || (!isAdd && currPollingSrcInterval && currPollingSrcInterval !== newPollingSrcInterval)
    ) {
      this.intervalChanger$.next({
        key: srcKey,
        value: newPollingSrcInterval,
      });

      PollerManager.poolChange.next({
        action: 'update polling source interval',
        context: {
          srcKey,
          from: currPollingSrcInterval,
          to: newPollingSrcInterval,
        },
        sources: {
          ...this.getInsights(this.sources),
        },
        pollingIntervals: {
          ...this.getInsights(this.minIntervals),
          inUse: Object.values(this.minIntervals).map((intervals) => intervals.peek())
        }
      });
    }

    return this.minIntervals[srcKey].peek();
  }

  private updateSubscriptionCount = (srcKey: string, sign: 'inc' | 'dec') => {
    if (sign === 'inc') {
      // Increase counter of polling source's subscribers
      if (!(srcKey in this.subCounter)) {
        this.subCounter[srcKey] = 0;
      }
      this.subCounter[srcKey]++;
    } else {
      this.subCounter[srcKey]--;
    }

    PollerManager.poolChange.next({
      action: 'update polling source subscription count',
      context: {
        srcKey,
        sign,
        updated: this.subCounter[srcKey]
      },
      sources: {
        ...this.getInsights(this.sources),
      },
      subscriptionCounters: {
        ...this.getInsights(this.subCounter),
      }
    });
  }

  private scheduleReaper = (srcKey: string) => {
    this.sourceReapers[srcKey] = setTimeout(() => {
      delete this.sources[srcKey];
      delete this.sourceReapers[srcKey];
      delete this.subCounter[srcKey];
      delete this.minIntervals[srcKey];

      PollerManager.poolChange.next({
        action: 'delete idle polling source',
        context: {
          srcKey,
        },
        internals: {
          sources: {
            isDeletedSuccessfully: Object.keys(this.sources).every(key => key !== srcKey),
            ...this.getInsights(this.sources)
          },
          sourceReapers: {
            isDeletedSuccessfully: Object.keys(this.sourceReapers).every(key => key !== srcKey),
            ...this.getInsights(this.sourceReapers)
          },
          subCounter: {
            isDeletedSuccessfully: Object.keys(this.subCounter).every(key => key !== srcKey),
            ...this.getInsights(this.subCounter)
          },
          pollingIntervals: {
            isDeletedSuccessfully: Object.keys(this.minIntervals).every(key => key !== srcKey),
            ...this.getInsights(this.minIntervals),
            inUse: Object.values(this.minIntervals).map((intervals) => intervals.peek())
          },
        }
      });
    }, PollerManager.IdlePollerTTL) as any;

    PollerManager.poolChange.next({
      action: 'schedule deletion of idle polling source',
      context: {
        srcKey,
      },
      internals: {
        sources: {
          isDeletedSuccessfully: Object.keys(this.sources).every(key => key !== srcKey),
          ...this.getInsights(this.sources)
        },
        sourceReapers: {
          isDeletedSuccessfully: Object.keys(this.sourceReapers).every(key => key !== srcKey),
          ...this.getInsights(this.sourceReapers)
        },
        subCounter: {
          isDeletedSuccessfully: Object.keys(this.subCounter).every(key => key !== srcKey),
          ...this.getInsights(this.subCounter)
        },
        pollingIntervals: {
          isDeletedSuccessfully: Object.keys(this.minIntervals).every(key => key !== srcKey),
          ...this.getInsights(this.minIntervals),
          inUse: Object.values(this.minIntervals).map((intervals) => intervals.peek())
        },
      }
    });
  }

  private getInsights = <T>(obj: T) => ({
    keys: Object.keys(obj),
    // values: Object.values(obj)
  })
}

export const pollerManager = new PollerManager();
