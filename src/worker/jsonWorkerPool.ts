import { Worker } from 'node:worker_threads';
import path from 'path';

type Task = {
  jsonStr: string;
  resolve: (value: any) => void;
  reject: (err: any) => void;
};

export class JSONWorkerPool {
  private pool: Worker[] = [];
  private queue: Task[] = [];
  private busyWorkers: Set<Worker> = new Set();

  constructor(size: number = 4) {
    for (let i = 0; i < size; i++) {
      console.log(path.resolve('./src/worker/jsonWorker.ts'))
      const worker = new Worker(path.resolve('E:\Coding\Tsugu-Backend\src\worker\jsonWorker.js'));
      worker.on('message', (result) => this.onMessage(worker, result));
      worker.on('error', (err) => this.onError(worker, err));
      this.pool.push(worker);
    }
  }

  private onMessage(worker: Worker, result: any) {
    const task = this.queue.shift();
    if (task) task.resolve(result);
    this.busyWorkers.delete(worker);
    this.next();
  }

  private onError(worker: Worker, err: any) {
    const task = this.queue.shift();
    if (task) task.reject(err);
    this.busyWorkers.delete(worker);
    this.next();
  }

  private next() {
    const idleWorker = this.pool.find(w => !this.busyWorkers.has(w));
    if (!idleWorker || this.queue.length === 0) return;
    const task = this.queue[0];
    this.busyWorkers.add(idleWorker);
    idleWorker.postMessage(task.jsonStr);
  }

  parse(jsonStr: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ jsonStr, resolve, reject });
      this.next();
    });
  }

  destroy() {
    this.pool.forEach(w => w.terminate());
  }
}
