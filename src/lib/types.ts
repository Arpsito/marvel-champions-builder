/** Hero entry from heroes.json */
export interface Hero {
  code: string;
  name: string;
  alter_ego: string | null;
  traits: string;
  imagesrc: string;
  total_decks: number;
}
