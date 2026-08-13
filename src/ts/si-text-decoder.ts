import { symbolUnicode } from "./symbol-unicode";

const controlCodes = {
    APR: 0x0d,
    LS1: 0x0e,
    LS0: 0x0f,
    SS2: 0x19,
    ESC: 0x1b,
    SS3: 0x1d,
    ESC_INTERMEDIATE_BEGIN: 0x20,
    ESC_INTERMEDIATE_END: 0x2f,
    ESC_FINAL_BEGIN: 0x30,
    ESC_FINAL_END: 0x7e,
    CSI_PARAMETER_BEGIN: 0x30,
    CSI_PARAMETER_END: 0x3f,
    CSI_INTERMEDIATE_BEGIN: 0x20,
    CSI_INTERMEDIATE_END: 0x2f,
    CSI_FINAL_BEGIN: 0x40,
    CSI_FINAL_END: 0x7e,
    SP: 0x20,
    MSZ: 0x89,
    NSZ: 0x8a,
    CSI: 0x9b,
} as const;

const eucJPDecoder = new TextDecoder("euc-jp");

const graphics = {
    jis1: 0x39,
    jis2: 0x3a,
    alphabet: 0x4a,
    hiragana: 0x30,
    katakana: 0x31,
    symbols: 0x3b,
} as const;

const dbcs = {
    [graphics.jis1]: true,
    [graphics.jis2]: true,
    [graphics.alphabet]: false,
    [graphics.hiragana]: false,
    [graphics.katakana]: false,
    [graphics.symbols]: true,
} as const;

const hiragana = Array.from({
    [84]: [],
    [85]: [],
    [86]: [],
    [87]: [1, 21],
    [88]: [1, 22],
    [89]: [1, 28],
    [90]: [1, 3],
    [91]: [1, 54],
    [92]: [1, 55],
    [93]: [1, 2],
    [94]: [1, 6],
    length: 95,
});

const katakana = Array.from({
    [87]: [1, 19],
    [88]: [1, 20],
    [89]: [1, 28],
    [90]: [1, 3],
    [91]: [1, 54],
    [92]: [1, 55],
    [93]: [1, 2],
    [94]: [1, 6],
    length: 95,
});

const alphabet = Array.from({
    [1]: [1, 10],
    [2]: [1, 41], // [92, 94],
    [3]: [1, 84],
    [4]: [1, 80],
    [5]: [1, 83],
    [6]: [1, 85],
    [7]: [1, 39], // [92, 93],
    [8]: [1, 42],
    [9]: [1, 43],
    [10]: [1, 86],
    [11]: [1, 60],
    [12]: [1, 4],
    [13]: [1, 61],
    [14]: [1, 5],
    [15]: [1, 31],
    [26]: [1, 7],
    [27]: [1, 8],
    [28]: [1, 67],
    [29]: [1, 65],
    [30]: [1, 68],
    [31]: [1, 9],
    [32]: [1, 87],
    [59]: [1, 46],
    [60]: [1, 32],
    [61]: [1, 47],
    [62]: [1, 16],
    [63]: [1, 18],
    [64]: [1, 14],
    [91]: [1, 48],
    [92]: [1, 35],
    [93]: [1, 49],
    [94]: [1, 33],
    length: 95,
});

type Graphics = (typeof graphics)[keyof typeof graphics];

type Size = typeof controlCodes.MSZ | typeof controlCodes.NSZ;

type DecoderState = {
    graphicsSet: [Graphics, Graphics, Graphics, Graphics];
    graphicsLeft: number;
    graphicsRight: number;
    size: Size;
    buffer: number[];
    result: string;
};

function decodeESC(state: DecoderState, data: Uint8Array, i: number): number {
    const intermediateBytes: number[] = [];
    while (data.length > i) {
        const c = data[i];
        if (c >= controlCodes.ESC_INTERMEDIATE_BEGIN && c <= controlCodes.ESC_INTERMEDIATE_END) {
            i++;
            intermediateBytes.push(c);
        } else {
            break;
        }
    }
    if (data.length <= i) {
        return i;
    }
    const finalByte = data[i];
    if (finalByte >= controlCodes.ESC_FINAL_BEGIN && finalByte <= controlCodes.ESC_FINAL_END) {
        i++;
        switch (finalByte) {
            case 0x6e: // LS2
                if (intermediateBytes.length === 0) {
                    state.graphicsLeft = 2;
                }
                break;
            case 0x6f: // LS3
                if (intermediateBytes.length === 0) {
                    state.graphicsLeft = 3;
                }
                break;
            case 0x7e: // LS1R
                if (intermediateBytes.length === 0) {
                    state.graphicsRight = 1;
                }
                break;
            case 0x7d: // LS2R
                if (intermediateBytes.length === 0) {
                    state.graphicsRight = 2;
                }
                break;
            case 0x7c: // LS3R
                if (intermediateBytes.length === 0) {
                    state.graphicsRight = 3;
                }
                break;
            case graphics.alphabet:
            case graphics.hiragana:
            case graphics.katakana:
                if (
                    intermediateBytes.length === 1 &&
                    intermediateBytes[0] >= 0x28 &&
                    intermediateBytes[0] <= 0x2b
                ) {
                    state.graphicsSet[intermediateBytes[0] - 0x28] = finalByte;
                }
                break;
            case graphics.jis1:
            case graphics.jis2:
            case graphics.symbols:
                if (intermediateBytes.length === 1 && intermediateBytes[0] === 0x24) {
                    state.graphicsSet[0] = finalByte;
                    break;
                } else if (
                    intermediateBytes.length === 2 &&
                    intermediateBytes[0] === 0x24 &&
                    intermediateBytes[1] >= 0x29 &&
                    intermediateBytes[1] <= 0x2b
                ) {
                    state.graphicsSet[intermediateBytes[1] - 0x28] = finalByte;
                }
                break;
        }
    }
    return i;
}

function decodeCSI(data: Uint8Array, i: number): number {
    const parameterBytes: number[] = [];
    const intermediateBytes: number[] = [];
    while (data.length > i) {
        const c = data[i];
        if (c >= controlCodes.CSI_PARAMETER_BEGIN && c <= controlCodes.CSI_PARAMETER_END) {
            i++;
            parameterBytes.push(c);
        } else {
            break;
        }
    }
    while (data.length > i) {
        const c = data[i];
        if (c >= controlCodes.CSI_INTERMEDIATE_BEGIN && c <= controlCodes.CSI_INTERMEDIATE_END) {
            i++;
            intermediateBytes.push(c);
        } else {
            break;
        }
    }
    if (data.length <= i) {
        return i;
    }
    const finalByte = data[i];
    if (finalByte >= controlCodes.CSI_FINAL_BEGIN && finalByte <= controlCodes.CSI_FINAL_END) {
        i++;
    }
    return i;
}

function writeASCII(state: DecoderState, c: number) {
    state.buffer.push(c);
}

function writeJIS(state: DecoderState, ku: number, ten: number) {
    state.buffer.push(ku + 0xa0, ten + 0xa0);
}

function writeUnicode(state: DecoderState, s: string) {
    flush(state);
    state.result += s;
}

function flush(state: DecoderState) {
    const b = eucJPDecoder.decode(Uint8Array.from(state.buffer));
    state.buffer.length = 0;
    state.result += b;
}

function writeSBCS(state: DecoderState, g: Graphics, first: number) {
    switch (g) {
        case graphics.alphabet:
            if (state.size === controlCodes.MSZ) {
                writeASCII(state, first + 0x20);
            } else {
                const a = alphabet[first];
                if (a != null) {
                    if (a.length === 2) {
                        writeJIS(state, a[0], a[1]);
                    }
                } else {
                    writeJIS(state, 3, first);
                }
            }
            break;
        case graphics.hiragana: {
            const a = hiragana[first];
            if (a != null) {
                if (a.length === 2) {
                    writeJIS(state, a[0], a[1]);
                }
            } else {
                writeJIS(state, 4, first);
            }
            break;
        }
        case graphics.katakana: {
            const a = katakana[first];
            if (a != null) {
                if (a.length === 2) {
                    writeJIS(state, a[0], a[1]);
                }
            } else {
                writeJIS(state, 5, first);
            }
            break;
        }
    }
}

function writeDBCS(state: DecoderState, g: Graphics, first: number, second: number) {
    switch (g) {
        case graphics.jis1:
            if (state.size === controlCodes.MSZ && first === 1 && second === 1) {
                writeASCII(state, 0x20);
            } else if (state.size === controlCodes.MSZ && first === 3) {
                writeASCII(state, second + 0x20);
            } else {
                writeJIS(state, first, second);
            }
            break;
        case graphics.symbols:
            writeUnicode(state, symbolUnicode.get(((first + 0x20) << 8) | (second + 0x20)) ?? "");
            break;
    }
}

function decodeCharacter(state: DecoderState, data: Uint8Array, i: number): number {
    const c = data[i];
    i++;
    if (c >= 0x21 && c <= 0x7e) {
        const first = (c & 0x7f) - 0x20;
        if (dbcs[state.graphicsSet[state.graphicsLeft]]) {
            if (data.length <= i) {
                return i;
            }
            const second = (data[i] & 0x7f) - 0x20;
            if (second < 1 || second > 94) {
                return i;
            }
            i++;
            writeDBCS(state, state.graphicsSet[state.graphicsLeft], first, second);
        } else {
            writeSBCS(state, state.graphicsSet[state.graphicsLeft], first);
        }
    } else if (c >= 0xa1 && c <= 0xfe) {
        const first = (c & 0x7f) - 0x20;
        if (dbcs[state.graphicsSet[state.graphicsRight]]) {
            if (data.length <= i) {
                return i;
            }
            const second = (data[i] & 0x7f) - 0x20;
            i++;
            writeDBCS(state, state.graphicsSet[state.graphicsRight], first, second);
        } else {
            writeSBCS(state, state.graphicsSet[state.graphicsRight], first);
        }
    }
    return i;
}

export function decodeSIText(data: Uint8Array): string {
    const state: DecoderState = {
        graphicsSet: [graphics.jis1, graphics.alphabet, graphics.hiragana, graphics.katakana],
        graphicsLeft: 0,
        graphicsRight: 2,
        size: controlCodes.NSZ,
        buffer: [],
        result: "",
    };
    for (let i = 0; i < data.length; ) {
        const c = data[i];
        i++;
        switch (c) {
            case controlCodes.ESC:
                i = decodeESC(state, data, i);
                break;
            case controlCodes.CSI:
                i = decodeCSI(data, i);
                break;
            case controlCodes.LS1:
                state.graphicsLeft = 1;
                break;
            case controlCodes.LS0:
                state.graphicsLeft = 0;
                break;
            case controlCodes.NSZ:
            case controlCodes.MSZ:
                state.size = c;
                break;
            case controlCodes.APR:
                writeASCII(state, 10);
                break;
            case controlCodes.SS2: {
                const { graphicsLeft } = state;
                state.graphicsLeft = 2;
                i = decodeCharacter(state, data, i);
                state.graphicsLeft = graphicsLeft;
                continue;
            }
            case controlCodes.SS3: {
                const { graphicsLeft } = state;
                state.graphicsLeft = 3;
                i = decodeCharacter(state, data, i);
                state.graphicsLeft = graphicsLeft;
                continue;
            }
            case controlCodes.SP:
                if (state.size === controlCodes.MSZ) {
                    writeASCII(state, 0x20);
                } else {
                    writeJIS(state, 1, 1);
                }
                break;
            default:
                i = decodeCharacter(state, data, i - 1);
                break;
        }
    }
    flush(state);
    return state.result;
}
