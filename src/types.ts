export interface MapOptions {
  center_lat: number;
  center_lon: number;
  tile_url: string;
  zoom_level: number;
}

export const defaults: MapOptions = {
  center_lat: 48.262725,
  center_lon: 11.66725,
  tile_url: '',
  zoom_level: 18,
};
