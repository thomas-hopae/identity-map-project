#!/usr/bin/env python3
import json
import sys

def flatten_points(coords):
    pts = []
    if not coords:
        return pts
    # coords can be nested lists for Polygon/MultiPolygon
    if isinstance(coords[0][0], (float, int)):
        # single linear ring
        for lon, lat in coords:
            pts.append((lat, lon))
    else:
        for part in coords:
            pts.extend(flatten_points(part))
    return pts

def centroid_of_geometry(geom):
    typ = geom.get('type')
    coords = geom.get('coordinates')
    pts = []
    if typ == 'Polygon':
        pts = flatten_points(coords)
    elif typ == 'MultiPolygon':
        for poly in coords:
            pts.extend(flatten_points(poly))
    else:
        # fallback: try to walk coords
        try:
            pts = flatten_points(coords)
        except Exception:
            pts = []

    if not pts:
        return None

    avg_lat = sum(p[0] for p in pts) / len(pts)
    avg_lon = sum(p[1] for p in pts) / len(pts)
    return avg_lat, avg_lon

def get_continent(lat, lon, name=None):
    # Antarctica
    if lat is None or lon is None:
        return 'Unknown'
    if lat <= -60:
        return 'Antarctica'

    # South America
    if -82 <= lon <= -34 and -56 <= lat <= 13:
        return 'South America'

    # North America (including Central America and Caribbean)
    if -170 <= lon <= -30 and lat >= 7:
        return 'North America'

    # Africa
    if -25 <= lon <= 60 and -35 <= lat <= 37:
        return 'Africa'

    # Europe
    if -25 <= lon <= 40 and lat >= 34 and lat <= 72:
        return 'Europe'

    # Oceania (including Australia, NZ, Pacific islands)
    if (lon >= 110 and lon <= 180 and lat <= 30) or (lon >= -180 and lon <= -140 and lat <= 30 and lat >= -50):
        return 'Oceania'

    # Asia (fallback)
    return 'Asia'


def main():
    import os
    script_dir = os.path.dirname(__file__)
    path = os.path.join(script_dir, '..', 'world.geojson')
    out = path
    try:
        with open(path, 'r', encoding='utf-8') as f:
            doc = json.load(f)
    except Exception as e:
        print('Failed to read world.geojson:', e)
        sys.exit(1)

    features = doc.get('features', [])
    for feat in features:
        props = feat.setdefault('properties', {})
        geom = feat.get('geometry')
        latlon = None
        if geom:
            latlon = centroid_of_geometry(geom)
        if latlon:
            lat, lon = latlon
            continent = get_continent(lat, lon, props.get('name'))
        else:
            continent = 'Unknown'
        props['region'] = continent

    try:
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
        print('Updated world.geojson with region properties.')
    except Exception as e:
        print('Failed to write updated geojson:', e)
        sys.exit(1)

if __name__ == '__main__':
    main()
