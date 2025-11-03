# greenspace-website backend processing
python code in a jupyter notebook to process raw census and satellite data needed to produce a website that maps greenspace accessibility
this processing tool was part of a proof of concept repo i made before this one. 

# notes on things i did manually because it wasnt worth automating

the census tract data was manually cleaned (and named censustracts) for processing and placed a copy in each city directory, it is of all of canada so its the same file for each city
i manually placed the landsat 8/9 data files (only really need b4 and b5 and dont rename) in subfolders titled landsat2_c2
created a copy of the final data file containing the citied in the repo directory for the website because the app needs somewhere to fetch the data for display and i wanted things to stay organized

be sure that the directory the py file is run in has access to an empty data folder in the same directory. also, it uses the raw data folder to store intermediate geojsons. the raw-data directory has to have a certain layout
