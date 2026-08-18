/**
 * Ses aktarımı — demuxer'sız yol.
 *
 * Kaynak dosya `decodeAudioData` ile PCM'e çözülür (tarayıcı hangi kabı
 * açabiliyorsa hepsi çalışır), in/out aralığı kesilir ve `AudioEncoder` ile
 * MP4 için AAC, WebM için Opus olarak yeniden kodlanır. Böylece ayrı bir
 * demuxer bağımlılığı olmadan ses korunur.
 */

export interface DecodedAudio {
  channels: Float32Array[]
  sampleRate: number
}

/** Object URL'den ses verisini çözer. Ses yoksa null döner. */
export async function decodeAudio(url: string): Promise<DecodedAudio | null> {
  try {
    const res = await fetch(url)
    const buf = await res.arrayBuffer()
    const AudioCtor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtor()
    try {
      const decoded = await ctx.decodeAudioData(buf)
      if (decoded.numberOfChannels === 0 || decoded.length === 0) return null
      const channels: Float32Array[] = []
      for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c).slice())
      return { channels, sampleRate: decoded.sampleRate }
    } finally {
      void ctx.close()
    }
  } catch {
    return null // ses parçası yok ya da çözülemedi
  }
}

export interface AudioEncodeOptions {
  codec: 'aac' | 'opus'
  bitrate: number
  startTime: number
  endTime: number
  onChunk: (chunk: EncodedAudioChunk, meta: EncodedAudioChunkMetadata | undefined) => void
}

/**
 * Seçilen aralığı kodlar. Kodlanan örnek sayısı video süresiyle eşleşir;
 * zaman damgaları aralığın başından itibaren mikrosaniyedir.
 */
export async function encodeAudioRange(
  audio: DecodedAudio,
  opts: AudioEncodeOptions,
): Promise<{ sampleRate: number; numberOfChannels: number } | null> {
  if (typeof AudioEncoder === 'undefined') return null
  const { channels, sampleRate } = audio
  const numberOfChannels = Math.min(2, channels.length)
  const startSample = Math.max(0, Math.floor(opts.startTime * sampleRate))
  const endSample = Math.min(channels[0]!.length, Math.ceil(opts.endTime * sampleRate))
  const total = endSample - startSample
  if (total <= 0) return null

  const codecString = opts.codec === 'aac' ? 'mp4a.40.2' : 'opus'
  const config: AudioEncoderConfig = {
    codec: codecString,
    sampleRate,
    numberOfChannels,
    bitrate: opts.bitrate,
  }
  const support = await AudioEncoder.isConfigSupported(config).catch(() => null)
  if (!support?.supported) return null

  let error: Error | null = null
  const encoder = new AudioEncoder({
    output: (chunk, meta) => opts.onChunk(chunk, meta),
    error: (e) => {
      error = e instanceof Error ? e : new Error(String(e))
    },
  })
  encoder.configure(config)

  const CHUNK = 4096
  for (let offset = 0; offset < total; offset += CHUNK) {
    if (error) break
    const frames = Math.min(CHUNK, total - offset)
    // f32-planar: kanallar arka arkaya
    const data = new Float32Array(frames * numberOfChannels)
    for (let c = 0; c < numberOfChannels; c++) {
      const src = channels[c] ?? channels[0]!
      data.set(src.subarray(startSample + offset, startSample + offset + frames), c * frames)
    }
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: frames,
      numberOfChannels,
      timestamp: Math.round((offset / sampleRate) * 1e6),
      data,
    })
    encoder.encode(audioData)
    audioData.close()
    if (encoder.encodeQueueSize > 16) await new Promise((r) => setTimeout(r, 0))
  }

  await encoder.flush()
  encoder.close()
  if (error) throw error
  return { sampleRate, numberOfChannels }
}
