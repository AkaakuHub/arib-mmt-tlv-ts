export type TSPacket = {
    transportErrorIndicator: boolean;
    payloadUnitStartIndicator: boolean;
    transportPriority: boolean;
    pid: number;
    transportScramblingControl: number;
    adaptationFieldControl: number;
    continuityCounter: number;
    payloadOffset: number;
    data: Uint8Array;
};
