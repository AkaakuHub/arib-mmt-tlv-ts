const CRC_32_POLY =
    (1 << 26) |
    (1 << 23) |
    (1 << 22) |
    (1 << 16) |
    (1 << 12) |
    (1 << 11) |
    (1 << 10) |
    (1 << 8) |
    (1 << 7) |
    (1 << 5) |
    (1 << 4) |
    (1 << 2) |
    (1 << 1) |
    (1 << 0);

let crc32Table = new Int32Array(0);
let crc32Table0 = new Int32Array(0);
let crc32Table1 = new Int32Array(0);
let crc32Table2 = new Int32Array(0);
let crc32Table3 = new Int32Array(0);
function setupCRC32Table() {
    crc32Table = new Int32Array(256);
    const crc32Tables = Array.from({ length: 4 }).map(() => new Int32Array(256));
    for (let i = 0; i < 256; i++) {
        let d = 0;
        for (let j = 7; j >= 0; j--) {
            if (((i >> j) ^ (d >>> 31)) & 1) {
                d = (d << 1) ^ CRC_32_POLY;
            } else {
                d <<= 1;
            }
        }
        crc32Table[i] = d;
    }
    crc32Tables[0] = crc32Table;
    for (let i = 0; i < 256; i++) {
        for (let j = 1; j < 4; j++) {
            crc32Tables[j][i] =
                crc32Table[crc32Tables[j - 1][i] >>> 24] ^ (crc32Tables[j - 1][i] << 8);
        }
    }
    [crc32Table0, crc32Table1, crc32Table2, crc32Table3] = crc32Tables;
}

export function calculateCRC32(data: Uint8Array, crc: number) {
    if (crc32Table.length === 0) {
        setupCRC32Table();
    }
    let i = 0;
    for (; i + 4 <= data.length; i += 4) {
        const d0 = data[i];
        const d1 = data[i + 1];
        const d2 = data[i + 2];
        const d3 = data[i + 3];
        crc =
            crc32Table3[d0 ^ (crc >>> 24)] ^
            crc32Table2[d1 ^ ((crc >>> 16) & 0xff)] ^
            crc32Table1[d2 ^ ((crc >>> 8) & 0xff)] ^
            crc32Table0[d3 ^ (crc & 0xff)];
    }
    for (; i < data.length; i += 1) {
        crc = (crc << 8) ^ crc32Table[data[i] ^ (crc >>> 24)];
    }
    return crc;
}
