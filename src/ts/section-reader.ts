import { concatBuffers } from "../utils";
import { TSReaderEventTarget } from "./event";
import { TSPacket } from "./packet";
import { readSection } from "./si";

type SectionBuffer = {
    continuityCounter: number;
    receivedLength: number;
    payloads: Uint8Array[];
};

export const PID_PAT = 0x0000;
export const PID_CAT = 0x0001;
export const PID_NIT = 0x0010;
export const PID_SDT = 0x0011;
export const PID_EIT = 0x0012;
export const PID_M_EIT = 0x0026;
export const PID_L_EIT = 0x0027;
export const PID_TOT = 0x0014;
export const PID_SDTT = 0x0023;
export const PID_SDTT_UPPER = 0x0028;
export const PID_BIT = 0x0024;
export const PID_CDT = 0x0029;
export const PID_DIT = 0x001e;
export const PID_SIT = 0x001f;

export class SectionReader {
    eventTarget?: TSReaderEventTarget;
    constructor(eventTarget?: TSReaderEventTarget) {
        this.eventTarget = eventTarget;
    }
    buffer: Map<number, SectionBuffer> = new Map();
    reset() {
        this.buffer.clear();
    }
    close() {
        delete this.eventTarget;
    }

    private pushSectionFragment(pid: number, buffer: SectionBuffer, fragment: Uint8Array): boolean {
        if (fragment.length === 0) {
            return false;
        }
        buffer.receivedLength += fragment.length;
        buffer.payloads.push(fragment);
        const tableId = buffer.payloads[0][0];
        if (tableId === 0xff) {
            // stuffing
            return true;
        }
        if (buffer.payloads[0].length < 3) {
            buffer.payloads = [concatBuffers(buffer.payloads)];
            if (buffer.payloads[0].length < 3) {
                return false;
            }
        }
        // reserved
        if (((buffer.payloads[0][1] >> 4) & 3) !== 3) {
            return true;
        }
        const firstSectionLength = ((buffer.payloads[0][1] << 8) | buffer.payloads[0][2]) & 0xfff;
        if (firstSectionLength + 3 > buffer.receivedLength) {
            return false;
        }
        let payload = concatBuffers(buffer.payloads);
        while (payload.length > 3) {
            const tableId = payload[0];
            if (tableId === 0xff) {
                // stuffing
                return true;
            }
            // reserved
            if (((payload[1] >> 4) & 3) !== 3) {
                return true;
            }
            const sectionLength = ((payload[1] << 8) | payload[2]) & 0xfff;
            if (sectionLength + 3 > payload.length) {
                break;
            }
            this.pushSection(pid, payload.subarray(0, sectionLength + 3));
            payload = payload.subarray(sectionLength + 3);
        }
        buffer.receivedLength = payload.length;
        if (payload.length === 0) {
            buffer.payloads = [];
        } else {
            buffer.payloads = [payload];
        }
        return false;
    }

    pushSection(pid: number, payload: Uint8Array) {
        const section = readSection(payload);
        if (section == null) {
            return;
        }
        switch (pid) {
            case PID_PAT:
                if (section.tableId === "PAT") {
                    this.eventTarget?.dispatchEvent("pat", { pid, section });
                }
                break;
            case PID_NIT:
                if (section.tableId === "NIT[actual]" || section.tableId === "NIT[other]") {
                    this.eventTarget?.dispatchEvent("nit", { pid, section });
                }
                break;
            case PID_EIT:
            case PID_M_EIT:
            case PID_L_EIT:
                if (
                    section.tableId === "EIT[p/f]" ||
                    section.tableId === "EIT[schedule basic]" ||
                    section.tableId === "EIT[schedule extended]"
                ) {
                    this.eventTarget?.dispatchEvent("eit", { pid, section });
                }
                break;
            case PID_SDT:
                if (section.tableId === "SDT[actual]" || section.tableId === "SDT[other]") {
                    this.eventTarget?.dispatchEvent("sdt", { pid, section });
                }
                break;
            case PID_CDT:
                if (section.tableId === "CDT") {
                    this.eventTarget?.dispatchEvent("cdt", { pid, section });
                }
                break;
            case PID_TOT:
                if (section.tableId === "TOT") {
                    this.eventTarget?.dispatchEvent("tot", { pid, section });
                }
                break;
            case PID_BIT:
                if (section.tableId === "BIT") {
                    this.eventTarget?.dispatchEvent("bit", { pid, section });
                }
                break;
            case PID_SIT:
                if (section.tableId === "SIT") {
                    this.eventTarget?.dispatchEvent("sit", { pid, section });
                }
                break;
            case PID_DIT:
                break;
            default:
                if (section.tableId === "PMT") {
                    this.eventTarget?.dispatchEvent("pmt", { pid, section });
                } else if (
                    section.tableId === "DDB" ||
                    section.tableId === "DII" ||
                    section.tableId === "streamDescriptor"
                ) {
                    this.eventTarget?.dispatchEvent("dsmcc", { pid, section });
                }
                break;
        }
    }
    push(packet: TSPacket) {
        let buffer = this.buffer.get(packet.pid);
        const payload = packet.data.subarray(packet.payloadOffset);
        if (packet.payloadUnitStartIndicator) {
            this.buffer.delete(packet.pid);
            const pointer = payload[0] + 1;
            if (payload[0] === 0x00 && payload[1] === 0x00 && payload[2] === 0x01) {
                return; // PES
            }
            if (
                buffer != null &&
                ((buffer.continuityCounter + 1) & 15) === packet.continuityCounter
            ) {
                const p = payload.subarray(1, pointer);
                if (p.length > 0) {
                    this.pushSectionFragment(packet.pid, buffer, p);
                }
            }
            buffer = {
                continuityCounter: packet.continuityCounter,
                receivedLength: 0,
                payloads: [],
            };
            this.buffer.set(packet.pid, buffer);
            if (this.pushSectionFragment(packet.pid, buffer, payload.slice(pointer))) {
                this.buffer.delete(packet.pid);
            }
        } else {
            if (buffer == null) {
                return;
            }
            if (buffer.continuityCounter === packet.continuityCounter) {
                // duplicate?
                return;
            }
            if (((buffer.continuityCounter + 1) & 15) !== packet.continuityCounter) {
                // discontinuity
                this.buffer.delete(packet.pid);
                return;
            }
            buffer.continuityCounter = packet.continuityCounter;
            if (this.pushSectionFragment(packet.pid, buffer, payload)) {
                this.buffer.delete(packet.pid);
            }
        }
    }
}
