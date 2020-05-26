import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Coordinate } from 'ol/coordinate';
import LineString from 'ol/geom/LineString';
import { Circle, Stroke, Style, Fill, Icon } from 'ol/style';
import Arrow from '../../img/arrow.png';

interface SingleData {
  // coordinate: [number, number];
  latitude: number;
  longitude: number;
  [key: string]: any;
}

export const processDataES = (data: SingleData[]) => {
  data.reverse();
  const perDeviceRoute: { [key: string]: [number, number][] } = {};
  const perDeviceTime: { [key: string]: number[] } = {};
  const perDeviceUncertainty: { [key: string]: number[] } = {};
  data.map(datum => {
    (perDeviceRoute[datum.device_aid] = perDeviceRoute[datum.device_aid] || []).push([datum.longitude, datum.latitude]);
    (perDeviceTime[datum.device_aid] = perDeviceTime[datum.device_aid] || []).push(parseInt(datum.timestamp[0]));
    (perDeviceUncertainty[datum.device_aid] = perDeviceUncertainty[datum.device_aid] || []).push(
      datum.horizontal_accuracy
    );
  });

  return { perDeviceRoute, perDeviceTime, perDeviceUncertainty };
};

export const createLine = (routeData: Coordinate[], timeData: number[], iterRoute: number) => {
  const dx = routeData[iterRoute + 1][0] - routeData[iterRoute][0];
  const dy = routeData[iterRoute + 1][1] - routeData[iterRoute][1];
  const rotation = Math.atan2(dy, dx);
  const lineFeature = new Feature(new LineString([routeData[iterRoute], routeData[iterRoute + 1]]));
  lineFeature.setProperties({ duration: `${timeData[iterRoute + 1] - timeData[iterRoute]}s` });
  lineFeature.setStyle([
    new Style({
      stroke: new Stroke({
        color: '#0080ff',
        width: 2,
      }),
    }),
    new Style({
      geometry: new Point(routeData[iterRoute + 1]),
      image: new Icon({
        src: Arrow,
        anchor: [0.75, 0.5],
        rotateWithView: true,
        rotation: -rotation,
      }),
    }),
  ]);
  return lineFeature;
};

export const createPoint = (routeData: Coordinate[], routeRadiusData: number[], iterRoute: number) => {
  const pointFeature = new Feature(new Point(routeData[iterRoute]));
  pointFeature.setStyle(
    new Style({
      image: new Circle({
        radius: routeRadiusData[iterRoute] || 2,
        fill: new Fill({ color: 'rgba(73,168,222,0.6)' }),
      }),
    })
  );
  return pointFeature;
};
