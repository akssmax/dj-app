declare module "music-tempo" {
  export default class MusicTempo {
    constructor(data: Float32Array | number[], options?: Record<string, number>)
    tempo: number
    beats: number[]
  }
}
