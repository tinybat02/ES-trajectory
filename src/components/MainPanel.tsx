import React, { PureComponent } from 'react';
import { PanelProps, Vector as VectorData } from '@grafana/data';
import { MapOptions } from '../types';
import { Map, View } from 'ol';
import XYZ from 'ol/source/XYZ';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { fromLonLat } from 'ol/proj';
import { defaults, DragPan, MouseWheelZoom } from 'ol/interaction';
import { platformModifierKeyOnly } from 'ol/events/condition';
import Select from 'ol/interaction/Select';
import { pointerMove } from 'ol/events/condition';
import { Stroke, Style, Text } from 'ol/style';
import nanoid from 'nanoid';
import { processDataES, createLine, createPoint } from './utils/helpers';
import 'ol/ol.css';
import '../style/MainPanel.css';

interface Props extends PanelProps<MapOptions> {}
interface Buffer extends VectorData {
  buffer: any;
}

interface State {
  options: string[];
  current: string;
  iterRoute: number;
  routeLength: number;
  showTotalRoute: boolean;
}

export class MainPanel extends PureComponent<Props> {
  id = 'id' + nanoid();
  map: Map;
  randomTile: TileLayer;
  perDeviceRoute: { [key: string]: [number, number][] };
  perDeviceTime: { [key: string]: number[] };
  perDeviceUncertainty: { [key: string]: number[] };
  partialRoute: VectorLayer;
  totalRoute: VectorLayer;

  state: State = {
    options: [],
    current: 'None',
    iterRoute: 0,
    routeLength: 0,
    showTotalRoute: true,
  };

  componentDidMount() {
    const { tile_url, zoom_level, center_lon, center_lat } = this.props.options;
    const { buffer } = this.props.data.series[0].fields[0].values as Buffer;

    const carto = new TileLayer({
      source: new XYZ({
        url: 'https://{1-4}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      }),
    });
    this.map = new Map({
      interactions: defaults({ dragPan: false, mouseWheelZoom: false, onFocusOnly: true }).extend([
        new DragPan({
          condition: function(event) {
            return platformModifierKeyOnly(event) || this.getPointerCount() === 2;
          },
        }),
        new MouseWheelZoom({
          condition: platformModifierKeyOnly,
        }),
      ]),
      layers: [carto],
      view: new View({
        center: fromLonLat([center_lon, center_lat]),
        zoom: zoom_level,
      }),
      target: this.id,
    });

    if (tile_url !== '') {
      this.randomTile = new TileLayer({
        source: new XYZ({
          url: tile_url,
        }),
        zIndex: 1,
      });
      this.map.addLayer(this.randomTile);
    }

    const hoverInteraction = new Select({
      condition: pointerMove,
      style: function(feature) {
        const style: { [key: string]: Style[] } = {};
        const geometry_type = feature.getGeometry().getType(),
          white = [255, 255, 255, 1],
          blue = [0, 153, 255, 1],
          width = 4;

        style['LineString'] = [
          new Style({
            stroke: new Stroke({
              color: white,
              width: width + 2,
            }),
            text: new Text({
              stroke: new Stroke({
                color: '#fff',
                width: 2,
              }),
              font: '18px Calibri,sans-serif',
              text: feature.get('duration'),
            }),
          }),
          new Style({
            stroke: new Stroke({
              color: blue,
              width: width,
            }),
          }),
        ];

        return style[geometry_type];
      },
    });
    this.map.addInteraction(hoverInteraction);

    const { perDeviceRoute, perDeviceTime, perDeviceUncertainty } = processDataES(buffer);
    this.perDeviceRoute = perDeviceRoute;
    this.perDeviceTime = perDeviceTime;
    this.perDeviceUncertainty = perDeviceUncertainty;

    this.setState({
      options: Object.keys(this.perDeviceRoute),
    });
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (prevProps.data.series[0] !== this.props.data.series[0]) {
      const { buffer } = this.props.data.series[0].fields[0].values as Buffer;

      this.map.removeLayer(this.partialRoute);
      this.map.removeLayer(this.totalRoute);
      this.setState({ options: [], current: 'None' });

      if (buffer.length !== 0) {
        const { perDeviceRoute, perDeviceTime, perDeviceUncertainty } = processDataES(buffer);
        this.perDeviceRoute = perDeviceRoute;
        this.perDeviceTime = perDeviceTime;
        this.perDeviceUncertainty = perDeviceUncertainty;

        this.setState({ options: Object.keys(this.perDeviceRoute) });
      }
    }

    if (prevProps.options.tile_url !== this.props.options.tile_url) {
      if (this.randomTile) {
        this.map.removeLayer(this.randomTile);
      }
      if (this.props.options.tile_url !== '') {
        this.randomTile = new TileLayer({
          source: new XYZ({
            url: this.props.options.tile_url,
          }),
          zIndex: 1,
        });
        this.map.addLayer(this.randomTile);
      }
    }

    if (prevProps.options.zoom_level !== this.props.options.zoom_level) {
      this.map.getView().setZoom(this.props.options.zoom_level);
    }

    if (
      prevProps.options.center_lat !== this.props.options.center_lat ||
      prevProps.options.center_lon !== this.props.options.center_lon
    ) {
      this.map.getView().animate({
        center: fromLonLat([this.props.options.center_lon, this.props.options.center_lat]),
        duration: 2000,
      });
    }

    if (prevState.current !== this.state.current) {
      this.map.removeLayer(this.partialRoute);
      this.map.removeLayer(this.totalRoute);

      this.setState({ iterRoute: 0, routeLength: 0 });

      if (this.state.current !== 'None') {
        const routeData = this.perDeviceRoute[this.state.current].map(coordinate => fromLonLat(coordinate));
        const timeData = this.perDeviceTime[this.state.current];
        const uncertaintyData = this.perDeviceUncertainty[this.state.current];

        this.setState({ routeLength: routeData.length });

        let totalRoute: Feature[] = [];
        const partialRoute: Feature<LineString>[] = [];

        if (routeData.length > 1) {
          const firstLine = createLine(routeData, timeData, 0);
          partialRoute.push(firstLine);
          for (let i = 0; i < routeData.length - 1; i++) {
            totalRoute.push(createLine(routeData, timeData, i));
          }
        }

        const totalPoints: Feature<Point>[] = [];
        for (let i = 0; i < routeData.length; i++) {
          totalPoints.push(createPoint(routeData, uncertaintyData, i));
        }

        this.totalRoute = new VectorLayer({
          source: new VectorSource({
            features: [...totalPoints, ...totalRoute],
          }),
          zIndex: 2,
        });

        this.map.addLayer(this.totalRoute);

        const pointFeatures: Feature<Point>[] = [];
        const firstPoint = createPoint(routeData, uncertaintyData, 0);
        pointFeatures.push(firstPoint);
        if (routeData.length > 1) {
          const secondPoint = createPoint(routeData, uncertaintyData, 1);
          pointFeatures.push(secondPoint);
        }
        this.partialRoute = new VectorLayer({
          source: new VectorSource({
            features: [...partialRoute, ...pointFeatures],
          }),
          zIndex: 2,
        });
      }
    }

    if (prevState.showTotalRoute !== this.state.showTotalRoute) {
      if (this.state.showTotalRoute) {
        this.map.removeLayer(this.partialRoute);
        this.map.removeLayer(this.totalRoute);
        this.map.addLayer(this.totalRoute);
      } else {
        this.map.removeLayer(this.totalRoute);
        this.map.removeLayer(this.totalRoute);
        this.map.addLayer(this.partialRoute);
      }
    }
  }

  handleSelector = (e: React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({ ...this.state, current: e.target.value, showTotalRoute: true });
  };

  handleShowTotalRoute = () => {
    this.setState({ showTotalRoute: !this.state.showTotalRoute });
  };

  handleIterRoute = (type: string) => () => {
    const routeData = this.perDeviceRoute[this.state.current].map(coordinate => fromLonLat(coordinate));
    const timeData = this.perDeviceTime[this.state.current];
    const uncertaintyData = this.perDeviceUncertainty[this.state.current];
    const { iterRoute } = this.state;
    if (type === 'previous' && iterRoute > 0) {
      this.map.removeLayer(this.partialRoute);
      this.setState({ iterRoute: iterRoute - 1 }, () => {
        const lineFeature = createLine(routeData, timeData, this.state.iterRoute);
        const beginPoint = createPoint(routeData, uncertaintyData, this.state.iterRoute);
        const endPoint = createPoint(routeData, uncertaintyData, this.state.iterRoute + 1);

        this.partialRoute = new VectorLayer({
          source: new VectorSource({
            features: [lineFeature, beginPoint, endPoint],
          }),
          zIndex: 2,
        });
        this.map.addLayer(this.partialRoute);
      });
    }

    if (type === 'next' && iterRoute < routeData.length - 2) {
      this.partialRoute && this.map.removeLayer(this.partialRoute);
      this.setState({ iterRoute: iterRoute + 1 }, () => {
        const lineFeature = createLine(routeData, timeData, this.state.iterRoute);
        const beginPoint = createPoint(routeData, uncertaintyData, this.state.iterRoute);
        const endPoint = createPoint(routeData, uncertaintyData, this.state.iterRoute + 1);

        this.partialRoute = new VectorLayer({
          source: new VectorSource({
            features: [lineFeature, beginPoint, endPoint],
          }),
          zIndex: 2,
        });
        this.map.addLayer(this.partialRoute);
      });
    }
  };

  render() {
    const { width, height } = this.props;
    const { options, current, iterRoute, routeLength, showTotalRoute } = this.state;

    return (
      <div
        style={{
          width,
          height,
        }}
      >
        <div className="tool-bar">
          <select id="selector" style={{ width: 350 }} onChange={this.handleSelector} value={current}>
            <option value="None">None</option>
            {options.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          {current !== 'None' && (
            <>
              <button
                className="custom-btn"
                onClick={this.handleIterRoute('previous')}
                disabled={showTotalRoute}
                style={{ backgroundColor: showTotalRoute ? '#ccc' : '#326666' }}
              >
                &#60;&#60;
              </button>
              <button
                className="custom-btn"
                onClick={this.handleIterRoute('next')}
                disabled={showTotalRoute}
                style={{ backgroundColor: showTotalRoute ? '#ccc' : '#326666' }}
              >
                &#62;&#62;
              </button>
              <button className="custom-btn" onClick={this.handleShowTotalRoute}>
                {showTotalRoute ? 'Show Single' : 'Show Total'} Route
              </button>
              <span style={{ marginLeft: 10 }}>
                {`${iterRoute + 1} / ${routeLength - 1} -- Begin: ${new Date(this.perDeviceTime[current][0] * 1000)
                  .toLocaleString('de-DE')
                  .replace(/\./g, '/')} -- End: ${new Date(
                  this.perDeviceTime[current][this.perDeviceTime[current].length - 1] * 1000
                )
                  .toLocaleString('de-DE')
                  .replace(/\./g, '/')}`}
              </span>
            </>
          )}
        </div>
        <div
          id={this.id}
          style={{
            width,
            height: height - 40,
          }}
        ></div>
      </div>
    );
  }
}
