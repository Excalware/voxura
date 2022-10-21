type Callback = (...args: any[]) => void;
interface Listener {
    name: string,
    callback: (...data: any[]) => void
};
export default class EventEmitter {
    private listeners: Listener[] = [];

    public emitEvent(name: string, ...data: any[]) {
        this.listeners.filter(l => l.name === name).forEach(l =>
            setTimeout(() => l.callback(...data), 0)
        );
    }

    public listenForEvent(name: string, callback: Callback) {
        const obj = { name, callback };
        this.listeners.push(obj);

        return () => {
            this.listeners.filter(l => l !== obj);
        };
    }

    public unlistenForEvent(name: string, callback: Callback) {
        this.listeners = this.listeners.filter(l => l.name !== name && l.callback !== callback);
    }
};