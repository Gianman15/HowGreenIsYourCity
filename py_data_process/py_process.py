def create_census_geojson(input_csv, input_shp, output_dir="data/"):
    import pandas as pd
    import geopandas as gpd
    import os
    canada_csv = input_csv
    shapefile_path = input_shp
    df = pd.read_csv(canada_csv, encoding='latin1', dtype={'CTUID': str})
    if 'CTUID' in df.columns:
        df['CTUID'] = df['CTUID'].astype(str).str.strip()
    print(df.head())
    df = df.drop(columns=['pop16', 'pop%delt', 'dwelltot', 'privd'])  
    if 'a_land' in df.columns:
        df = df.rename(columns={'a_land': 'LANDAREA'})
    print(df.head())
    gdf = gpd.read_file(shapefile_path)
    gdf = gdf.to_crs(epsg=4326) # Ensure both are in the same CRS
    if 'CTUID' in gdf.columns:
        gdf['CTUID'] = gdf['CTUID'].astype(str).str.strip()
    merged = gdf.merge(df, left_on='CTUID', right_on='CTUID')
    os.makedirs(output_dir, exist_ok=True)
    geojson_path = os.path.join(output_dir, "censustracts.geojson")
    merged.to_file(geojson_path, driver="GeoJSON")
    print(f"Census tracts GeoJSON saved to: {geojson_path}")
    return geojson_path
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
    return output_tiff
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
    parent_dir = os.path.dirname(dir_name)
    base_name = file_name.replace('.tiff', '').replace('.tif', '')
    base_name = base_name.replace('_mask', '')  # Remove '_mask' from filename
    output_geojson = os.path.join(parent_dir, f"greenspace_{base_name}.geojson")
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
        gdf = gdf.to_crs(epsg=4326)  # Ensure both are in the same CRS
        gdf.to_file(output_geojson, driver="GeoJSON")
        print(f"GeoJSON saved to: {output_geojson}")
        return output_geojson
def clip_geojson_to_CD(input_file, output_dir, census_div_shapefile, cduid=None):
    import os
    import geopandas as gpd
    if cduid is None:
        raise ValueError("cduid must be provided")
    census_div_gdf = gpd.read_file(census_div_shapefile)
    census_div_gdf = census_div_gdf.to_crs(epsg=4326)
    cd_geometry = census_div_gdf[census_div_gdf["CDUID"] == cduid]
    if cd_geometry.empty:
        raise ValueError(f"No census division found with CDUID: {cduid}")
    gdf = gpd.read_file(input_file)
    gdf = gdf.to_crs(epsg=4326)
    clipped_gdf = gpd.clip(gdf, cd_geometry)
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, f"greenspace_clipped_{cduid}.geojson")
    clipped_gdf.to_file(output_file, driver="GeoJSON")
    print(f"Clipped GeoJSON saved to: {output_file}")
    return output_file
def combine_greenspace_with_census(input_file, output_dir, census_dir=None, census_div_shapefile=None, cduid=None):
    import geopandas as gpd
    import pandas as pd
    import os
    input_file = os.path.abspath(input_file)
    output_dir = os.path.abspath(output_dir)
    try:
        clipped_gdf = gpd.read_file(input_file)
        print(f"Clipped GeoJSON loaded from: {input_file}")
    except Exception as e:
        print(f"Error reading the clipped GeoJSON file: {e}")
        return None
    try:
        if census_dir is None:
            base_dir = os.path.dirname(os.path.dirname(output_dir))  # Get base directory
            city_name = os.path.basename(output_dir)
            census_path = os.path.join(base_dir, "data", city_name, "censustracts.geojson")
        else:
            census_path = os.path.join(census_dir, "censustracts.geojson")
        census_gdf = gpd.read_file(census_path)
        if census_div_shapefile is not None and cduid is not None:
            census_div_gdf = gpd.read_file(census_div_shapefile)
            census_div_gdf = census_div_gdf.to_crs(epsg=4326)
            cd_geometry = census_div_gdf[census_div_gdf["CDUID"] == cduid]
            if not cd_geometry.empty:
                census_gdf = census_gdf.to_crs(epsg=4326)
                census_gdf = gpd.clip(census_gdf, cd_geometry)
                print(f"Census tracts clipped to census division: {cduid}")
        if 'LANDAREA_y' in census_gdf.columns:
            census_gdf['LANDAREA'] = pd.to_numeric(census_gdf['LANDAREA_y'], errors='coerce') * 1e6
        elif 'LANDAREA_x' in census_gdf.columns:
            census_gdf['LANDAREA'] = pd.to_numeric(census_gdf['LANDAREA_x'], errors='coerce') * 1e6
        elif 'LANDAREA' in census_gdf.columns:
            census_gdf['LANDAREA'] = pd.to_numeric(census_gdf['LANDAREA'], errors='coerce')
            if census_gdf['LANDAREA'].median() < 1000:  # Heuristic: if median < 1000, it's in km²
                census_gdf['LANDAREA'] = census_gdf['LANDAREA'] * 1e6
        print(f"Census GeoJSON loaded from: {census_path}")
    except Exception as e:
        print(f"Error reading the censustracts file from {census_path}: {e}")
        return None
    clipped_gdf = clipped_gdf.to_crs(epsg=4326)
    census_gdf = census_gdf.to_crs(epsg=4326)
    print(f"Number of greenspace polygons before join: {len(clipped_gdf)}")
    total_greenspace_area_before = clipped_gdf.to_crs(epsg=32188).geometry.area.sum()
    print(f"Total greenspace area before join: {total_greenspace_area_before:,.2f} m²")
    try:
        print("Performing overlay intersection (this may take a moment)...")
        joined = gpd.overlay(clipped_gdf, census_gdf, how='intersection')
        print(f"Number of greenspace polygons after overlay: {len(joined)}")
        print(f"Number of polygons without CTUID match: {joined['CTUID'].isna().sum()}")
        total_greenspace_area_after = joined.to_crs(epsg=32188).geometry.area.sum()
        print(f"Total greenspace area after overlay: {total_greenspace_area_after:,.2f} m²")
        area_diff = abs(total_greenspace_area_before - total_greenspace_area_after)
        if area_diff > 100:  # Allow 100 m² tolerance for rounding
            print(f"⚠️ WARNING: Area changed by {area_diff:,.2f} m² during overlay!")
    except Exception as e:
        print(f"Error performing overlay: {e}")
        return None
    os.makedirs(output_dir, exist_ok=True)
    combined_file = os.path.join(output_dir, "greenspace_with_census.geojson")
    try:
        joined.to_file(combined_file, driver="GeoJSON")
        print(f"Combined GeoJSON saved to: {combined_file}")
        return combined_file
    except Exception as e:
        print(f"Error saving the combined GeoJSON: {e}")
        return None
def write_frontend_clipped_greenspace(combined_file, base_dir, city_name, cduid):
    import geopandas as gpd
    import os
    print(f"\n📐 Creating tract-clipped greenspace for frontend...")
    try:
        gdf = gpd.read_file(combined_file)
        print(f"   Loaded {len(gdf)} greenspace polygons from combined file")
    except Exception as e:
        print(f"❌ Error loading combined greenspace: {e}")
        return None
    census_file = os.path.join(base_dir, "data", city_name, "censustracts.geojson")
    try:
        census_gdf = gpd.read_file(census_file)
        print(f"   Loaded {len(census_gdf)} census tracts")
    except Exception as e:
        print(f"❌ Error loading census tracts: {e}")
        return None
    gdf = gdf.to_crs(epsg=4326)
    census_gdf = census_gdf.to_crs(epsg=4326)
    print(f"   Clipping greenspace to census tract union...")
    census_union = census_gdf.union_all()
    clipped_gdf = gpd.clip(gdf, census_union)
    print(f"   Result: {len(clipped_gdf)} polygons after clipping")
    clipped_gdf = clipped_gdf[['geometry']].copy()
    clipped_gdf = gpd.GeoDataFrame(clipped_gdf, geometry='geometry', crs='EPSG:4326')
    out_dir = os.path.join(base_dir, "data", city_name)
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, f"greenspace_clipped_{cduid}.geojson")
    try:
        clipped_gdf.to_file(out_file, driver="GeoJSON")
        print(f"✅ Frontend greenspace saved: {out_file}")
        gs_bounds = clipped_gdf.total_bounds
        ct_bounds = census_gdf.total_bounds
        extends = []
        if gs_bounds[0] < ct_bounds[0] - 0.0001:
            extends.append("west")
        if gs_bounds[2] > ct_bounds[2] + 0.0001:
            extends.append("east")
        if gs_bounds[1] < ct_bounds[1] - 0.0001:
            extends.append("south")
        if gs_bounds[3] > ct_bounds[3] + 0.0001:
            extends.append("north")
        if extends:
            print(f"⚠️  Warning: Greenspace still extends beyond tracts: {', '.join(extends)}")
        else:
            print(f"✅ Verified: Greenspace is within census tract bounds")
        return out_file
    except Exception as e:
        print(f"❌ Error writing frontend greenspace: {e}")
        import traceback
        traceback.print_exc()
        return None
def process_greenspace_census_data(input_file, output_dir):
    import geopandas as gpd
    import pandas as pd
    import os
    greenspace_capita = gpd.read_file(input_file)
    greenspace_capita = greenspace_capita.to_crs(epsg=32188) # Ensure  CRS
    input_dir = os.path.dirname(input_file)
    greenspace_capita['greenspace_area'] = greenspace_capita.geometry.area
    print(f"Total rows in greenspace_with_census: {len(greenspace_capita)}")
    print(f"Unique census tracts (CTUID): {greenspace_capita['CTUID'].nunique()}")
    print(f"Rows with null CTUID: {greenspace_capita['CTUID'].isna().sum()}")
    total_area_before_groupby = greenspace_capita['greenspace_area'].sum()
    print(f"Total greenspace area before groupby: {total_area_before_groupby:,.2f} m²")
    if 'LANDAREA_y' in greenspace_capita.columns:
        greenspace_capita['LANDAREA'] = pd.to_numeric(greenspace_capita['LANDAREA_y'], errors='coerce') * 1e6
    elif 'LANDAREA_x' in greenspace_capita.columns:
        greenspace_capita['LANDAREA'] = pd.to_numeric(greenspace_capita['LANDAREA_x'], errors='coerce') * 1e6
    elif 'LANDAREA' in greenspace_capita.columns:
        greenspace_capita['LANDAREA'] = pd.to_numeric(greenspace_capita['LANDAREA'], errors='coerce')
        if greenspace_capita['LANDAREA'].median() < 1000:  # Heuristic: if median < 1000, it's in km²
            greenspace_capita['LANDAREA'] = greenspace_capita['LANDAREA'] * 1e6
    else:
        print("Warning: LANDAREA column not found. Available columns:", greenspace_capita.columns.tolist())
        raise KeyError("LANDAREA column not found in the greenspace_with_census file. Check that the census data was properly merged.")
    greenspace_capita['CTUID'] = greenspace_capita['CTUID'].astype(str)
    greenspace_capita['pop21'] = pd.to_numeric(greenspace_capita['pop21'], errors='coerce')
    greenspace_capita['LANDAREA'] = pd.to_numeric(greenspace_capita['LANDAREA'], errors='coerce')
    greenspace_sum = greenspace_capita.groupby('CTUID').agg({
        'greenspace_area': 'sum',
        'pop21': 'first',
        'LANDAREA': 'first'
    }).reset_index()
    total_area_after_groupby = greenspace_sum['greenspace_area'].sum()
    print(f"Total greenspace area after groupby: {total_area_after_groupby:,.2f} m²")
    print(f"Number of census tracts with greenspace: {len(greenspace_sum)}")
    if abs(total_area_before_groupby - total_area_after_groupby) > 1:
        print(f"⚠️ WARNING: Area mismatch! Lost {total_area_before_groupby - total_area_after_groupby:,.2f} m² during groupby")
    greenspace_sum['greenspace_per_tract'] = greenspace_sum['greenspace_area'] / greenspace_sum['LANDAREA']
    greenspace_sum['greenspace_per_capita'] = greenspace_sum['greenspace_area'] / greenspace_sum['pop21']
    print("\n📊 Sample greenspace_area values BEFORE geometry merge:")
    print(greenspace_sum[['CTUID', 'greenspace_area', 'LANDAREA']].head(10))
    base_dir = os.path.dirname(os.path.dirname(input_dir))
    city_name = os.path.basename(input_dir)
    census_path = os.path.join(base_dir, "data", city_name, "censustracts.geojson")
    if os.path.exists(census_path):
        census_gdf = gpd.read_file(census_path)
        census_gdf['CTUID'] = census_gdf['CTUID'].astype(str)
        census_gdf = census_gdf.to_crs(epsg=32188)
        greenspace_sum = census_gdf[['CTUID', 'geometry']].merge(
            greenspace_sum, on='CTUID', how='right'
        )
        greenspace_sum = gpd.GeoDataFrame(greenspace_sum, geometry='geometry', crs='EPSG:32188')
        print("\n📊 Sample greenspace_area values AFTER geometry merge:")
        print(greenspace_sum[['CTUID', 'greenspace_area', 'LANDAREA']].head(10))
    else:
        print(f"Warning: Census file not found at {census_path}. Using first greenspace geometry per tract.")
        greenspace_with_geom = greenspace_capita.groupby('CTUID')['geometry'].first().reset_index()
        greenspace_sum = greenspace_sum.merge(greenspace_with_geom, on='CTUID')
        greenspace_sum = gpd.GeoDataFrame(greenspace_sum, geometry='geometry', crs='EPSG:32188')
    save_dir = os.path.join(input_dir, os.path.basename(input_file).replace("greenspace_with_census.geojson", "greenspace_capita.geojson"))
    greenspace_sum = greenspace_sum.to_crs(epsg=4326)
    greenspace_sum.to_file(save_dir, driver="GeoJSON")
    print(f"Greenspace capita data saved to: {save_dir}")
def process_greenspace_data(input_file, output_dir):
    import geopandas as gpd
    import pandas as pd
    import os
    import numpy as np
    try:
        input_dir = os.path.dirname(input_file)
        save_dir = os.path.join(input_dir, os.path.basename(input_file))
        greenspace_capita = gpd.read_file(input_file)
        greenspace_capita = greenspace_capita.to_crs(epsg=32188)  # Ensure CRS is in meters for area calculations
        if 'greenspace_area' not in greenspace_capita.columns:
            raise KeyError("greenspace_area column not found in capita file. The file may be corrupted.")
        print(f"📊 Loaded capita file with {len(greenspace_capita)} census tracts")
        print(f"Total greenspace area in capita file: {greenspace_capita['greenspace_area'].sum():,.2f} m²")
        if 'LANDAREA_y' in greenspace_capita.columns:
            greenspace_capita['LANDAREA'] = pd.to_numeric(greenspace_capita['LANDAREA_y'], errors='coerce') * 1e6
        elif 'LANDAREA_x' in greenspace_capita.columns:
            greenspace_capita['LANDAREA'] = pd.to_numeric(greenspace_capita['LANDAREA_x'], errors='coerce') * 1e6
        elif 'LANDAREA' in greenspace_capita.columns:
            greenspace_capita['LANDAREA'] = pd.to_numeric(greenspace_capita['LANDAREA'], errors='coerce')
            if greenspace_capita['LANDAREA'].median() < 1000:  # Heuristic: if median < 1000, it's in km²
                greenspace_capita['LANDAREA'] = greenspace_capita['LANDAREA'] * 1e6
        else:
            print("Warning: No LANDAREA column found. Available columns:", greenspace_capita.columns.tolist())
            raise KeyError("LANDAREA column not found")
        greenspace_capita['CTUID'] = greenspace_capita['CTUID'].astype(str)
        greenspace_capita['pop21'] = pd.to_numeric(greenspace_capita['pop21'], errors='coerce')
        greenspace_sum = greenspace_capita.copy()
        greenspace_sum['greenspace_per_capita'] = 0.0
        has_pop_mask = greenspace_sum['pop21'].notna() & (greenspace_sum['pop21'] > 0)
        greenspace_sum.loc[has_pop_mask, 'greenspace_per_capita'] = (
            greenspace_sum.loc[has_pop_mask, 'greenspace_area'] / greenspace_sum.loc[has_pop_mask, 'pop21']
        )
        no_pop_mask = greenspace_sum['pop21'].isna() | (greenspace_sum['pop21'] <= 0)
        greenspace_sum.loc[no_pop_mask, 'greenspace_per_capita'] = -1.0
        save_dir = os.path.join(input_dir, os.path.basename(input_file))
        greenspace_sum = gpd.GeoDataFrame(greenspace_sum, geometry='geometry', crs='EPSG:32188')
        greenspace_sum = greenspace_sum.to_crs(epsg=4326)  # Convert back to WGS84 for GeoJSON
        greenspace_sum.to_file(save_dir, driver="GeoJSON")
        print(f"Greenspace capita data saved to: {save_dir}")
        greenspace_sum = greenspace_sum.to_crs(epsg=32188)  # Convert back to projected CRS for area calculations
        greenspace_final = greenspace_sum.drop(columns=[
            'CTNAME', 'PRUID', 'CDUID', 'CDNAME', 'CSDUID', 'CSDNAME',
            'CMAUID', 'CMANAME', 'CDTYPE', 'CSDTYPE', 'TYPE', 'pop21', 'LANDAREA'
        ], errors='ignore')  # Use `errors='ignore'` to avoid issues if columns are missing
        greenspace_final_path = os.path.join(output_dir, "greenspace_final.geojson")
        census_path = os.path.join(output_dir, "censustracts.geojson")
        census_gdf = gpd.read_file(census_path)
        census_gdf = census_gdf.to_crs(epsg=4326)
        greenspace_sum = greenspace_sum.to_crs(epsg=4326)
        GS_capita_gdf = census_gdf[['CTUID', 'geometry']].merge(
            greenspace_sum[['CTUID', 'greenspace_per_capita']],
            on='CTUID',
            how='left'
        )
        GS_capita_gdf['greenspace_per_capita'] = GS_capita_gdf['greenspace_per_capita'].fillna(0.0)
        GS_capita_gdf = gpd.GeoDataFrame(GS_capita_gdf, geometry='geometry', crs='EPSG:4326')
        greenspace_final_path = os.path.join(output_dir, "greenspace_per_capita.geojson")
        GS_capita_gdf.to_file(greenspace_final_path, driver="GeoJSON")
        print(f"CRS before saving: {GS_capita_gdf.crs}")
        print(f"Final greenspace data saved to: {greenspace_final_path}")
    except Exception as e:
        print(f"An error occurred: {e}")
def clip_final_geojson_files(census_div_shapefile, cduid, base_dir, city_name):
    import geopandas as gpd
    import os
    os.environ['OGR_GEOJSON_MAX_OBJ_SIZE'] = '0'
    census_div_gdf = gpd.read_file(census_div_shapefile)
    census_div_gdf = census_div_gdf.to_crs(epsg=4326)
    cd_geometry = census_div_gdf[census_div_gdf["CDUID"] == cduid]
    if cd_geometry.empty:
        raise ValueError(f"No census division found with CDUID: {cduid}")
    output_dir = os.path.join(base_dir, "data", city_name)
    os.makedirs(output_dir, exist_ok=True)
    greenspace_per_capita_file = os.path.join(output_dir, "greenspace_per_capita.geojson")
    censustracts_file = os.path.join(output_dir, "censustracts.geojson")
    print(f"Clipping files to census division: {cduid}")
    if os.path.exists(greenspace_per_capita_file):
        try:
            gdf = gpd.read_file(greenspace_per_capita_file)
            gdf = gdf.to_crs(epsg=4326)
            clipped_gdf = gpd.clip(gdf, cd_geometry)
            clipped_gdf.to_file(greenspace_per_capita_file, driver="GeoJSON")
            print(f"✓ Clipped greenspace_per_capita.geojson saved to: {greenspace_per_capita_file}")
        except Exception as e:
            print(f"✗ Error clipping greenspace_per_capita.geojson: {e}")
    else:
        print(f"⚠ greenspace_per_capita.geojson not found at: {greenspace_per_capita_file}")
    if os.path.exists(censustracts_file):
        try:
            gdf = gpd.read_file(censustracts_file)
            gdf = gdf.to_crs(epsg=4326)
            clipped_gdf = gpd.clip(gdf, cd_geometry)
            clipped_gdf.to_file(censustracts_file, driver="GeoJSON")
            print(f"✓ Clipped censustracts.geojson saved to: {censustracts_file}")
        except Exception as e:
            print(f"✗ Error clipping censustracts.geojson: {e}")
    else:
        print(f"⚠ censustracts.geojson not found at: {censustracts_file}")
    print("Clipping completed!")
def generate_city_summary_stats(city_name, base_dir, cduid):
    import geopandas as gpd
    import pandas as pd
    import json
    import os
    output_dir = os.path.join(base_dir, "data", city_name)
    census_file = os.path.join(output_dir, "censustracts.geojson")
    if not os.path.exists(census_file):
        raise FileNotFoundError(f"censustracts.geojson not found at: {census_file}")
    census_gdf = gpd.read_file(census_file)
    census_gdf = census_gdf.to_crs(epsg=32188)  # Use projected CRS for accurate area calculations
    census_gdf['CTUID'] = census_gdf['CTUID'].astype(str)
    census_gdf['actual_land_area_m2'] = census_gdf.geometry.area
    total_land_area_m2 = census_gdf['actual_land_area_m2'].sum()
    print(f"📏 Calculated land area from census tract geometries: {total_land_area_m2 / 1e6:.2f} km²")
    capita_file = os.path.join(base_dir, "raw-data", city_name, "greenspace_capita.geojson")
    if not os.path.exists(capita_file):
        raise FileNotFoundError(f"greenspace_capita.geojson not found at: {capita_file}")
    capita_gdf = gpd.read_file(capita_file)
    capita_gdf = capita_gdf.to_crs(epsg=32188)
    capita_gdf['CTUID'] = capita_gdf['CTUID'].astype(str)
    valid_tracts = capita_gdf[capita_gdf['pop21'] > 0].copy()
    total_population = capita_gdf['pop21'].sum()
    greenspace_file_clipped = os.path.join(output_dir, f"greenspace_clipped_{cduid}.geojson")
    greenspace_file_plain = os.path.join(output_dir, f"greenspace_{cduid}.geojson")
    if os.path.exists(greenspace_file_clipped):
        greenspace_file = greenspace_file_clipped
    elif os.path.exists(greenspace_file_plain):
        greenspace_file = greenspace_file_plain
    else:
        print(f"Warning: Clipped greenspace file not found. Using capita file greenspace_area.")
        total_greenspace_m2 = capita_gdf['greenspace_area'].sum()
        total_greenspace_km2 = total_greenspace_m2 / 1e6
    if os.path.exists(greenspace_file_clipped) or os.path.exists(greenspace_file_plain):
        greenspace_gdf = gpd.read_file(greenspace_file)
        greenspace_gdf = greenspace_gdf.to_crs(epsg=32188)
        print(f"🔧 Processing greenspace polygons...")
        print(f"   Original greenspace polygons: {len(greenspace_gdf)}")
        census_union = census_gdf.geometry.unary_union
        greenspace_gdf = greenspace_gdf[greenspace_gdf.geometry.intersects(census_union)].copy()
        greenspace_gdf['geometry'] = greenspace_gdf.geometry.intersection(census_union)
        greenspace_gdf = greenspace_gdf[~greenspace_gdf.geometry.is_empty]
        print(f"   After clipping to census tracts: {len(greenspace_gdf)} polygons")
        print(f"   Dissolving overlapping greenspace polygons...")
        greenspace_union = greenspace_gdf.geometry.unary_union
        if hasattr(greenspace_union, 'geoms'):
            total_greenspace_m2 = sum(geom.area for geom in greenspace_union.geoms)
        else:
            total_greenspace_m2 = greenspace_union.area
        total_greenspace_km2 = total_greenspace_m2 / 1e6
        print(f"✓ Using clipped greenspace file: {os.path.basename(greenspace_file)}")
        print(f"🌳 Total greenspace area (dissolved, no overlaps): {total_greenspace_km2:.2f} km²")
    if len(valid_tracts) > 0 and total_population > 0:
        avg_greenspace_per_capita = total_greenspace_m2 / total_population
    else:
        avg_greenspace_per_capita = 0
    greenspace_percentage = (total_greenspace_m2 / total_land_area_m2) * 100 if total_land_area_m2 > 0 else 0
    summary_stats = {
        "city_name": city_name,
        "cduid": cduid,
        "average_greenspace_per_capita_m2": round(avg_greenspace_per_capita, 2),
        "total_greenspace_area_km2": round(total_greenspace_km2, 2),
        "total_population": int(total_population),
        "greenspace_percentage": round(greenspace_percentage, 2),
        "total_land_area_km2": round(total_land_area_m2 / 1e6, 2),
        "number_of_census_tracts": len(census_gdf),
        "tracts_with_population": len(valid_tracts)
    }
    output_file = os.path.join(output_dir, "summary_stats.json")
    with open(output_file, 'w') as f:
        json.dump(summary_stats, f, indent=2)
    print(f"✓ Summary statistics saved to: {output_file}")
    print(f"\n📊 Summary for {city_name}:")
    print(f"  - Average greenspace per capita: {summary_stats['average_greenspace_per_capita_m2']} m²/person")
    print(f"  - Total greenspace area: {summary_stats['total_greenspace_area_km2']} km²")
    print(f"  - Total population: {summary_stats['total_population']:,}")
    print(f"  - Total land area: {summary_stats['total_land_area_km2']} km²")
    print(f"  - Greenspace percentage: {summary_stats['greenspace_percentage']}%")
    return summary_stats
def generate_all_cities_summary(base_dir, cities_list):
    import json
    import os
    all_cities_data = []
    for city_info in cities_list:
        city_name = city_info['city_name']
        summary_file = os.path.join(base_dir, "data", city_name, "summary_stats.json")
        if os.path.exists(summary_file):
            with open(summary_file, 'r') as f:
                city_data = json.load(f)
                all_cities_data.append(city_data)
                print(f"✓ Loaded summary for {city_name}")
        else:
            print(f"⚠ Summary file not found for {city_name} at: {summary_file}")
    output_file = os.path.join(base_dir, "data", "all_cities_summary.json")
    with open(output_file, 'w') as f:
        json.dump(all_cities_data, f, indent=2)
    print(f"\n✓ Combined summary saved to: {output_file}")
    print(f"  Total cities processed: {len(all_cities_data)}")
    return all_cities_data
def smooth_census_tract_values_proximity(city_name, base_dir, cduid, proximity_distance=300):
    import geopandas as gpd
    import pandas as pd
    import numpy as np
    import os
    print(f"\n{'='*60}")
    print(f"🌳 Creating accessibility-based greenspace map for {city_name.upper()}")
    print(f"   Proximity distance: {proximity_distance}m")
    print(f"{'='*60}\n")
    capita_file = os.path.join(base_dir, "raw-data", city_name, "greenspace_capita.geojson")
    greenspace_file_clipped = os.path.join(base_dir, "data", city_name, f"greenspace_clipped_{cduid}.geojson")
    greenspace_file_plain = os.path.join(base_dir, "data", city_name, f"greenspace_{cduid}.geojson")
    if os.path.exists(greenspace_file_clipped):
        greenspace_file = greenspace_file_clipped
    elif os.path.exists(greenspace_file_plain):
        greenspace_file = greenspace_file_plain
    else:
        raise FileNotFoundError(f"Greenspace file not found at:\n  {greenspace_file_clipped}\n  {greenspace_file_plain}")
    census_file = os.path.join(base_dir, "data", city_name, "censustracts.geojson")
    output_file = os.path.join(base_dir, "data", city_name, "greenspace_per_capita_smoothed.geojson")
    print(f"Using greenspace file: {greenspace_file}")
    print("📂 Loading census tract data...")
    census_gdf = gpd.read_file(census_file)
    census_gdf = census_gdf.to_crs(epsg=32188)  # Projected CRS
    census_gdf['CTUID'] = census_gdf['CTUID'].astype(str)
    capita_gdf = gpd.read_file(capita_file)
    capita_gdf = capita_gdf.to_crs(epsg=32188)
    capita_gdf['CTUID'] = capita_gdf['CTUID'].astype(str)
    capita_lookup = capita_gdf.set_index('CTUID')[['greenspace_area', 'pop21']].to_dict('index')
    own_greenspace_series = census_gdf['CTUID'].map(
        lambda x: capita_lookup.get(x, {}).get('greenspace_area', 0)
    )
    census_gdf['own_greenspace'] = pd.to_numeric(own_greenspace_series, errors='coerce').fillna(0)
    population_series = census_gdf['CTUID'].map(
        lambda x: capita_lookup.get(x, {}).get('pop21', np.nan)
    )
    census_gdf['population'] = pd.to_numeric(population_series, errors='coerce')
    if 'pop21' in census_gdf.columns:
        census_pop = pd.to_numeric(census_gdf['pop21'], errors='coerce')
    else:
        census_pop = pd.Series(np.nan, index=census_gdf.index)
    missing_pop_mask = census_gdf['population'].isna() | (census_gdf['population'] <= 0)
    census_gdf.loc[missing_pop_mask, 'population'] = census_pop[missing_pop_mask]
    census_gdf['population'] = census_gdf['population'].fillna(0)
    if missing_pop_mask.any():
        print(f"   Filled population for {(missing_pop_mask).sum()} tracts using census fallback")
    zero_pop_cts = int((census_gdf['population'] <= 0).sum())
    print(f"   Loaded {len(census_gdf)} census tracts")
    print(f"   Original greenspace range: {census_gdf['own_greenspace'].min():.0f} - {census_gdf['own_greenspace'].max():.0f} m²")
    print(f"   Tracts with zero population after fallback: {zero_pop_cts}")
    print(f"📂 Loading greenspace polygons...")
    greenspace_gdf = gpd.read_file(greenspace_file)
    greenspace_gdf = greenspace_gdf.to_crs(epsg=32188)
    greenspace_gdf['area_m2'] = greenspace_gdf.geometry.area
    print(f"   Loaded {len(greenspace_gdf)} greenspace polygons")
    print(f"🌿 Calculating accessible greenspace within {proximity_distance}m...")
    accessible_greenspace = []
    for idx, tract_row in census_gdf.iterrows():
        tract_geom = tract_row.geometry
        search_buffer = tract_geom.buffer(proximity_distance)
        nearby_greenspace = greenspace_gdf[greenspace_gdf.intersects(search_buffer)]
        total_accessible = 0
        for gs_idx, gs_row in nearby_greenspace.iterrows():
            distance = tract_geom.centroid.distance(gs_row.geometry.centroid)
            if distance <= proximity_distance:
                weight = 1 - (distance / proximity_distance)
                total_accessible += gs_row['area_m2'] * weight
        accessible_greenspace.append(total_accessible)
        if (idx + 1) % 100 == 0:
            print(f"   Processed {idx + 1}/{len(census_gdf)} tracts...")
    census_gdf['accessible_greenspace'] = accessible_greenspace
    valid_pop = census_gdf['population'] > 0
    census_gdf['greenspace_per_capita'] = 0.0
    census_gdf.loc[valid_pop, 'greenspace_per_capita'] = (
        (census_gdf.loc[valid_pop, 'own_greenspace'] + census_gdf.loc[valid_pop, 'accessible_greenspace']) /
        census_gdf.loc[valid_pop, 'population']
    )
    census_gdf.loc[~valid_pop, 'greenspace_per_capita'] = -1.0
    print(f"\n📊 Results:")
    print(f"   Accessible greenspace range: {census_gdf['accessible_greenspace'].min():.0f} - {census_gdf['accessible_greenspace'].max():.0f} m²")
    print(f"   Tracts with zero own greenspace but nearby access: {((census_gdf['own_greenspace'] == 0) & (census_gdf['accessible_greenspace'] > 0) & valid_pop).sum()}")
    print(f"   Final per capita range: {census_gdf[valid_pop]['greenspace_per_capita'].min():.2f} - {census_gdf[valid_pop]['greenspace_per_capita'].max():.2f} m²/person")
    print(f"   Average per capita: {census_gdf[valid_pop]['greenspace_per_capita'].mean():.2f} m²/person")
    output_gdf = census_gdf[['CTUID', 'greenspace_per_capita', 'geometry']].copy()
    output_gdf = output_gdf.to_crs(epsg=4326)
    print(f"\n💾 Saving to: {output_file}")
    output_gdf.to_file(output_file, driver="GeoJSON")
    print(f"✅ Complete! Output has {len(output_gdf)} census tracts")
    print(f"{'='*60}\n")
    return output_file
def process_city_pipeline(city_name, base_dir, census, census_boundaries, census_div_shapefile, cduid):
    import os
    import glob
    os.environ['OGR_GEOJSON_MAX_OBJ_SIZE'] = '0'
    city_dir = os.path.join(base_dir, "raw-data", city_name)
    output_dir = os.path.join(base_dir, "data", city_name)
    os.makedirs(output_dir, exist_ok=True)
    create_census_geojson(census, census_boundaries, output_dir)
    red_band_list = glob.glob(os.path.join(city_dir, "landsat2_c2", "*_B4.TIF"))
    nir_band_list = glob.glob(os.path.join(city_dir, "landsat2_c2", "*_B5.TIF"))
    if not red_band_list or not nir_band_list:
        raise FileNotFoundError("landsat Red or NIR band files not found in the expected directory.")
    red_band = red_band_list[0]
    nir_band = nir_band_list[0]
    print(f"Found red band: {red_band}")
    print(f"Found NIR band: {nir_band}")
    ndvi_tiff = os.path.join(city_dir, "landsat2_c2", f"ndvi_{city_name}.tiff")
    mask_tiff = os.path.join(city_dir, "landsat2_c2", f"ndvi_{city_name}_mask.tiff")
    geojson_mask = os.path.join(city_dir, f"greenspace_ndvi_{city_name}.geojson")
    clipped_geojson = os.path.join(output_dir, f"greenspace_clipped_{cduid}.geojson")
    combined_geojson = os.path.join(city_dir, "greenspace_with_census.geojson")
    capita_geojson = os.path.join(city_dir, "greenspace_capita.geojson")
    print(f"Processing city: {city_name}")
    scale_tiff(red_band)
    scale_tiff(nir_band)
    calculate_ndvi(red_band, nir_band, city=f"{city_name}.tiff")
    otsu_ndvi_threshold(ndvi_tiff)
    mask_to_geojson(mask_tiff)
    clip_geojson_to_CD(geojson_mask, output_dir, census_div_shapefile, cduid=cduid)
    combine_greenspace_with_census(clipped_geojson, city_dir, census_div_shapefile=census_div_shapefile, cduid=cduid)
    write_frontend_clipped_greenspace(combined_geojson, base_dir, city_name, cduid)
    process_greenspace_census_data(combined_geojson, output_dir)
    process_greenspace_data(capita_geojson, output_dir)
    clip_final_geojson_files(census_div_shapefile, cduid, base_dir, city_name)
    generate_city_summary_stats(city_name, base_dir, cduid)
    try:
        print(f"\n{'='*60}")
        print(f"Step 11: Creating proximity-based accessibility map...")
        print(f"{'='*60}")
        smooth_census_tract_values_proximity(city_name, base_dir, cduid, proximity_distance=300)
    except Exception as e:
        print(f"\n❌ ERROR in Step 11 (smooth_census_tract_values_proximity):")
        print(f"   {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        print(f"\n⚠️ Pipeline continuing despite smoothing failure...")
    print(f"Pipeline completed for city: {city_name}")
if __name__ == "__main__":
    generate_city_summary_stats(
        city_name="victoria",
        base_dir=r"B:\\greenspace_web\\py_data_process",
        cduid="5917",
    )
    print("\n" + "="*60 + "\n")
    generate_city_summary_stats(
        city_name="calgary",
        base_dir=r"B:\\greenspace_web\\py_data_process",
        cduid="4806",
    )