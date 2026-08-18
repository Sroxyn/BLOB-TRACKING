/**
 * Scratch — isimli ara buffer havuzu.
 * Pipeline her karede aynı anahtarları ister; boyut değişmediyse aynı bellek
 * döner. Kare başına `new` yapılmaz (GC duraklamaları önizlemede takılma yapar).
 */
export class Scratch {
  private u8s = new Map<string, Uint8ClampedArray>()
  private i32s = new Map<string, Int32Array>()
  private f32s = new Map<string, Float32Array>()

  u8(key: string, len: number): Uint8ClampedArray {
    let b = this.u8s.get(key)
    if (!b || b.length !== len) {
      b = new Uint8ClampedArray(len)
      this.u8s.set(key, b)
    }
    return b
  }

  i32(key: string, len: number): Int32Array {
    let b = this.i32s.get(key)
    if (!b || b.length !== len) {
      b = new Int32Array(len)
      this.i32s.set(key, b)
    }
    return b
  }

  f32(key: string, len: number): Float32Array {
    let b = this.f32s.get(key)
    if (!b || b.length !== len) {
      b = new Float32Array(len)
      this.f32s.set(key, b)
    }
    return b
  }

  /** Belirli bir anahtarı unutur (ör. arka plan modeli sıfırlanırken). */
  drop(key: string): void {
    this.u8s.delete(key)
    this.i32s.delete(key)
    this.f32s.delete(key)
  }

  clear(): void {
    this.u8s.clear()
    this.i32s.clear()
    this.f32s.clear()
  }
}
