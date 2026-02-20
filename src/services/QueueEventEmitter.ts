type EventCallback = () => void;

const listeners: Record<string, EventCallback[]> = {
    next: [],
    previous: [],
};

export function emitNext(): void {
    listeners.next.forEach(callback => callback());
}

export function emitPrevious(): void {
    listeners.previous.forEach(callback => callback());
}

export function onNext(callback: EventCallback): () => void {
    listeners.next.push(callback);
    return () => {
        listeners.next = listeners.next.filter(listener => listener !== callback);
    };
}

export function onPrevious(callback: EventCallback): () => void {
    listeners.previous.push(callback);
    return () => {
        listeners.previous = listeners.previous.filter(listener => listener !== callback);
    };
}
