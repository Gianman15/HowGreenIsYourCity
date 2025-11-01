def create_census_geojson(input_csv,input_shp):
    import pandas as pd
    import geopandas as gpd
    import os
    canada_csv = input_csv
    shapefile_path = input_shp
    df = pd.read_csv(canada_csv, encoding='latin1')
    df = df.apply(pd.to_numeric, errors='coerce')
    print(df.head())
    df = df.drop(columns=['pop16', 'pop%delt', 'dwelltot', 'privd'])  
    df = pd.read_csv(canada_csv, encoding='latin1')
    df = df.drop(columns=['pop16', 'pop%delt', 'dwelltot', 'privd']) 
    print(df.head())
    gdf = gpd.read_file(shapefile_path)
    gdf = gdf.to_crs(epsg=4326) # Ensure both are in the same CRS
    merged = gdf.merge(df, left_on='CTUID', right_on='CTUID')
    geojson_path = os.path.join("data/", "censustracts.geojson")
    merged.to_file(geojson_path, driver="GeoJSON")
def scale_tiff(input_tiff, prefix="scaled_"):
    import rasterio
    from rasterio.merge import merge
    from rasterio.features import shapes
    import os
    dir_name, file_name = os.path.split(input_tiff)
    output_tiff = os.path.join(dir_name, prefix + file_name)
    with rasterio.open(input_tiff) as src:
        profile = src.profile
        data = src.read(1)  # Read the first band
        scaled_data = (data * 0.0000275) - 0.2
        profile.update(dtype=rasterio.float32)
        with rasterio.open(output_tiff, 'w', **profile) as dst:
            dst.write(scaled_data.astype(rasterio.float32), 1)
    print("Scaling complete. Output saved to:", output_tiff)
def calculate_ndvi(red_band_path, nir_band_path, city):
    import numpy as np
    import rasterio
    from rasterio.merge import merge
    from rasterio.features import shapes
    import os
    dir_name, file_name = os.path.split(red_band_path)
    output_tiff = os.path.join(dir_name, "ndvi_" + city)
    with rasterio.open(red_band_path) as red_src:
        red = red_src.read(1).astype('float32')
        profile = red_src.profile
    with rasterio.open(nir_band_path) as nir_src:
        nir = nir_src.read(1).astype('float32')
    ndvi = (nir - red) / (nir + red)
    ndvi = np.clip(ndvi, -1, 1)  # Optional: clip values to valid NDVI range
    profile.update(dtype=rasterio.float32, count=1)
    with rasterio.open(output_tiff, 'w', **profile) as dst:
        dst.write(ndvi, 1)
    print("NDVI calculation complete. Output saved to:", output_tiff)
def otsu_ndvi_threshold(ndvi_tiff):
    import numpy as np
    from skimage.filters import threshold_otsu
    import rasterio
    from rasterio.merge import merge
    from rasterio.features import shapes
    import os
    with rasterio.open(ndvi_tiff) as src:
        ndvi = src.read(1)
        profile = src.profile
    ndvi_flat = ndvi.flatten()
    ndvi_flat = ndvi_flat[~np.isnan(ndvi_flat)]
    thresh = threshold_otsu(ndvi_flat)
    print(f"Otsu threshold for NDVI: {thresh}")
    mask = (ndvi >= thresh).astype(np.uint8)
    profile.update(dtype=rasterio.uint8, count=1)
    mask_tiff = ndvi_tiff.replace('.tiff', '_mask.tiff')
    with rasterio.open(mask_tiff, 'w', **profile) as dst:
        dst.write(mask, 1)
    print("Mask saved to:", mask_tiff)
    return thresh, mask_tiff
def mask_to_geojson(mask_tiff):
    import pandas as pd
    import geopandas as gpd
    import numpy as np
    from skimage.filters import threshold_otsu
    import rasterio
    from rasterio.merge import merge
    from rasterio.features import shapes
    import os
    from shapely.geometry import box
    dir_name, file_name = os.path.split(mask_tiff)
    base_name = file_name.replace('.tiff', '').replace('.tif', '')
    output_geojson = os.path.join(dir_name, f"greenspace_{base_name}.geojson")
    with rasterio.open(mask_tiff) as src:
        mask = src.read(1)
        mask = mask.astype('uint8')
        transform = src.transform
        crs = src.crs
        results = (
            {"properties": {"value": v}, "geometry": s}
            for s, v in shapes(mask, mask=mask==1, transform=transform)
            if v == 1
        )
        gdf = gpd.GeoDataFrame.from_features(list(results))
        gdf = gdf.set_crs(crs)
        gdf = gdf.to_crs(epsg=4326) # Ensure both are in the same CRS
        gdf.to_file("raw-data/montreal/output_simplified.geojson", driver="GeoJSON")
        print(f"GeoJSON saved to: {output_geojson}")
def clip_geojson_to_bbox(input_file):
    import geopandas as gpd
    from shapely.geometry import box
    print("Enter the bounding box coordinates:")
    minx = float(input("Minimum longitude (minx): "))
    miny = float(input("Minimum latitude (miny): "))
    maxx = float(input("Maximum longitude (maxx): "))
    maxy = float(input("Maximum latitude (maxy): "))
    try:
        greenspace_gdf = gpd.read_file(input_file)
    except Exception as e:
        print(f"Error reading the file: {e}")
        return
    bbox = box(minx, miny, maxx, maxy)
    try:
        clipped_gdf = greenspace_gdf.clip(bbox)
    except Exception as e:
        print(f"Error clipping the GeoJSON: {e}")
        return
    output_file = input_file.replace(".geojson", "_clipped.geojson")
    try:
        clipped_gdf.to_file(output_file, driver="GeoJSON")
        print(f"Clipped GeoJSON saved to: {output_file}")
    except Exception as e:
        print(f"Error saving the clipped GeoJSON: {e}")
def combine_greenspace_with_census(input_file):
    import geopandas as gpd
    import os
    input_dir = os.path.dirname(input_file)
    clipped_file = os.path.join(input_dir, os.path.basename(input_file))
    try:
        clipped_gdf = gpd.read_file(clipped_file)
        print(f"Clipped GeoJSON loaded from: {clipped_file}")
    except Exception as e:
        print(f"Error reading the clipped GeoJSON file: {e}")
        return
    try:
        census_gdf = gpd.read_file("data/censustracts.geojson")
    except Exception as e:
        print(f"Error reading the censustracts file: {e}")
        return
    clipped_gdf = clipped_gdf.to_crs(epsg=4326)
    census_gdf = census_gdf.to_crs(epsg=4326)
    try:
        joined = gpd.sjoin(clipped_gdf, census_gdf, how="left", predicate="intersects")
    except Exception as e:
        print(f"Error performing spatial join: {e}")
        return
    combined_file = os.path.join(input_dir, os.path.basename(input_file).replace(".geojson", "_with_census.geojson"))
    try:
        joined.to_file(combined_file, driver="GeoJSON")
        print(f"Combined GeoJSON saved to: {combined_file}")
    except Exception as e:
        print(f"Error saving the combined GeoJSON: {e}")
        return
def process_greenspace_census_data(input_file, output_dir):
    import geopandas as gpd
    import pandas as pd
    import os
    try:
        greenspace_capita = gpd.read_file("raw-data/montreal/output_simplified_clipped_with_census.geojson")
        greenspace_capita = greenspace_capita.to_crs(epsg=32188) # Ensure  CRS
        greenspace_capita['greenspace_area'] = greenspace_capita.geometry.area
        greenspace_capita['LANDAREA']= greenspace_capita['LANDAREA']*1e6
        greenspace_capita['CTUID'] = greenspace_capita['CTUID'].astype(str)
        greenspace_capita['pop21'] = pd.to_numeric(greenspace_capita['pop21'], errors='coerce')
        greenspace_capita['LANDAREA'] = pd.to_numeric(greenspace_capita['LANDAREA'], errors='coerce')
        greenspace_sum = greenspace_capita.groupby('CTUID').agg({
            'greenspace_area': 'sum',
            'pop21': 'first',
            'LANDAREA': 'first',
            'geometry': 'first'
        }).reset_index()
        greenspace_sum['greenspace_per_tract'] = greenspace_sum['greenspace_area'] / greenspace_sum['LANDAREA']
        greenspace_sum['greenspace_per_capita'] = greenspace_sum['greenspace_area'] / greenspace_sum['pop21']
        greenspace_sum = gpd.GeoDataFrame(greenspace_sum, geometry='geometry', crs='EPSG:32188')
        greenspace_sum = greenspace_sum.to_crs(epsg=4326)
        greenspace_sum.to_file("raw-data/montreal/greenspace_capita.geojson", driver="GeoJSON")
        greenspace_final = gpd.read_file("raw-data/montreal/greenspace_capita.geojson")
        greenspace_final = greenspace_final.drop(columns=['CTNAME', 'PRUID', 'CDUID', 'CDNAME', 'CSDUID', 'CSDNAME', 'CMAUID', 'CMANAME', 'CDTYPE', 'CSDTYPE', 'TYPE', 'pop21', 'LANDAREA'], errors='ignore')
        greenspace_final_path = f"{output_dir}/greenspace_final.geojson"
        greenspace_final.to_file(greenspace_final_path, driver="GeoJSON")
        print(f"Final greenspace data saved to: {greenspace_final_path}")
    except Exception as e:
        print(f"An error occurred: {e}")
def process_greenspace_data(input_file, output_dir):
    import geopandas as gpd
    import pandas as pd
    import os
    import numpy as np
    print(f"we are at processing greenspace data below")
    try:
        greenspace_capita = gpd.read_file(input_file)
        greenspace_capita = greenspace_capita.to_crs(epsg=32188)  # Ensure CRS is in meters for area calculations
        greenspace_capita['greenspace_area'] = greenspace_capita.geometry.area
        greenspace_capita['LANDAREA'] = greenspace_capita['LANDAREA'] * 1e6  # Convert LANDAREA to square meters
        greenspace_capita['CTUID'] = greenspace_capita['CTUID'].astype(str)
        greenspace_capita['pop21'] = pd.to_numeric(greenspace_capita['pop21'], errors='coerce')
        greenspace_capita['LANDAREA'] = pd.to_numeric(greenspace_capita['LANDAREA'], errors='coerce')
        greenspace_sum = greenspace_capita.groupby('CTUID').agg({
            'greenspace_area': 'sum',
            'pop21': 'first',
            'LANDAREA': 'first',
            'geometry': 'first'
        }).reset_index()
        greenspace_sum['greenspace_per_capita'] = greenspace_sum['greenspace_area'] / greenspace_sum['pop21']
        greenspace_sum['greenspace_per_capita'] = greenspace_sum['greenspace_area'] / greenspace_sum['pop21']
        greenspace_sum.loc[greenspace_sum['greenspace_area'] == 0, 'greenspace_per_capita'] = 0.0
        no_pop_mask = greenspace_sum['pop21'].isna() | (greenspace_sum['pop21'] <= 0)
        greenspace_sum.loc[no_pop_mask, 'greenspace_per_capita'] = -1.0
        greenspace_sum = gpd.GeoDataFrame(greenspace_sum, geometry='geometry', crs='EPSG:32188')
        greenspace_sum = greenspace_sum.to_crs(epsg=4326)  # Convert back to WGS84 for GeoJSON
        greenspace_capita_path = os.path.join(output_dir, "greenspace_capita.geojson")
        greenspace_sum.to_file(greenspace_capita_path, driver="GeoJSON")
        print(f"Greenspace capita data saved to: {greenspace_capita_path}")
        greenspace_final = greenspace_sum.drop(columns=[
            'CTNAME', 'PRUID', 'CDUID', 'CDNAME', 'CSDUID', 'CSDNAME',
            'CMAUID', 'CMANAME', 'CDTYPE', 'CSDTYPE', 'TYPE', 'pop21', 'LANDAREA'
        ], errors='ignore')  # Use `errors='ignore'` to avoid issues if columns are missing
        census_gdf = gpd.read_file("data/censustracts.geojson")
        census_gdf = census_gdf.to_crs(epsg=4326)
        greenspace_sum = greenspace_sum.to_crs(epsg=4326)
        GS_capita_gdf = census_gdf[['CTUID', 'geometry']].merge(
            greenspace_sum[['CTUID', 'greenspace_per_capita']],
            on='CTUID',
            how='left'
        )
        GS_capita_gdf = gpd.GeoDataFrame(GS_capita_gdf, geometry='geometry', crs='EPSG:4326')
        greenspace_final_path = os.path.join(output_dir, "greenspace_capita.geojson")
        greenspace_final.to_file(greenspace_final_path, driver="GeoJSON")
        print(f"Final greenspace data saved to: {greenspace_final_path}")
    except Exception as e:
        print(f"An error occurred: {e}")