export class Timestamp {
    seconds = 0;
    nanoseconds = 0;

    static now(): Timestamp {
        return Timestamp.fromMillis(Date.now());
    }

    static fromMillis(milliseconds: number): Timestamp {
        const timestamp = new Timestamp();
        timestamp.seconds = Math.floor(milliseconds / 1000);
        timestamp.nanoseconds = (milliseconds % 1000) * 1000000;
        return timestamp;
    }

    static fromDate(date: Date): Timestamp {
        return Timestamp.fromMillis(date.getTime());
    }

    toMillis(): number {
        return this.seconds * 1000 + Math.floor(this.nanoseconds / 1000000);
    }

    toDate(): Date {
        return new Date(this.toMillis());
    }
}
