declare module 'youtube-caption-scraper' {
  export interface Subtitle {
    start: string;
    dur: string;
    text: string;
  }
  
  export interface GetSubtitlesOptions {
    videoID: string;
    lang?: string;
  }
  
  export function getSubtitles(options: GetSubtitlesOptions): Promise<Subtitle[]>;
}
