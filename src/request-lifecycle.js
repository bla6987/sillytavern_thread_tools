/** One cancellable request per owner; superseded results can never update its UI. */
export class RequestSlot {
    constructor() {
        this.pending = null;
        this.revision = 0;
        this.disposed = false;
    }

    run(key, request, apply) {
        if (this.disposed) return Promise.resolve();
        if (this.pending?.key === key) return this.pending.promise;
        this.cancel();
        const revision = this.revision;
        const controller = new AbortController();
        const pending = { key, controller, promise: null };
        const current = () => !this.disposed && this.revision === revision && !controller.signal.aborted;
        this.pending = pending;
        pending.promise = (async () => {
            try {
                const value = await request(controller.signal);
                if (current()) return apply(value);
            } catch (error) {
                if (current()) throw error;
            } finally {
                if (this.pending === pending) this.pending = null;
            }
        })();
        return pending.promise;
    }

    cancel() {
        this.revision++;
        const pending = this.pending;
        this.pending = null;
        pending?.controller.abort();
    }

    dispose() {
        this.disposed = true;
        this.cancel();
    }
}
