import { concatBuffers } from "../utils";
import { TSPacket } from "./packet";

type PESBuffer = {
    length: number;
    receivedLength: number;
    payloads: Uint8Array[];
    continuityCounter: number;
};
export class PESReader {
    private buffer: PESBuffer | undefined;
    constructor() {
        this.buffer = undefined;
    }

    reset() {
        this.buffer = undefined;
    }

    *pushPacket(packet: TSPacket): Generator<Uint8Array> {
        if (packet.transportErrorIndicator || packet.transportScramblingControl !== 0) {
            return;
        }
        if (packet.adaptationFieldControl !== 0b01 && packet.adaptationFieldControl !== 0b11) {
            return;
        }
        let buffer = this.buffer;
        if (packet.payloadUnitStartIndicator) {
            this.buffer = undefined;
        }
        if (
            packet.payloadUnitStartIndicator &&
            buffer?.length === 0 &&
            buffer?.payloads.length > 0
        ) {
            if (((buffer.continuityCounter + 1) & 15) === packet.continuityCounter) {
                yield concatBuffers(buffer.payloads);
            }
        }
        const payload = packet.data.slice(packet.payloadOffset);
        if (packet.payloadUnitStartIndicator) {
            if (payload.length > 6) {
                if (payload[0] !== 0x00 || payload[1] !== 0x00 || payload[2] !== 0x01) {
                    return;
                } else {
                    const length = (payload[4] << 8) | payload[5];
                    if (length === 0) {
                        buffer = {
                            length: 0,
                            receivedLength: payload.length,
                            payloads: [payload],
                            continuityCounter: packet.continuityCounter,
                        };
                    } else {
                        buffer = {
                            length: length + 6,
                            receivedLength: payload.length,
                            payloads: [payload],
                            continuityCounter: packet.continuityCounter,
                        };
                    }
                    this.buffer = buffer;
                }
            }
        } else {
            if (buffer == null) {
                return;
            }
            if (buffer.continuityCounter === packet.continuityCounter) {
                return;
            }
            if (((buffer.continuityCounter + 1) & 15) !== packet.continuityCounter) {
                this.buffer = undefined;
                return;
            }
            buffer.continuityCounter = packet.continuityCounter;
            buffer.payloads.push(payload);
            buffer.receivedLength += payload.length;
        }
        if (buffer == null) {
            return;
        }
        if (buffer.length !== 0 && buffer.length <= buffer.receivedLength) {
            this.buffer = undefined;
            yield concatBuffers(buffer.payloads).subarray(0, buffer.length);
        }
    }
}
