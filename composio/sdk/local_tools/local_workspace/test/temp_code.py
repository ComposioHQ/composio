from pvlib.temperature import TEMPERATURE_MODEL_PARAMETERS
from pvlib.bifacial.pvfactors import pvfactors_timeseries
import os
import pathlib
import time
import json
from datetime import datetime
from time import mktime, gmtime

import pandas as pd

from pvlib import pvsystem
from pvlib import location as pvlocation
from pvlib import modelchain
from pvlib.temperature import TEMPERATURE_MODEL_PARAMETERS as PARAMS
not used - - to remove


class PV:
    def pv_transform_time(self, val):
        # tt = gmtime(val / 1000)
        tt = gmtime(val)
        dd = datetime.fromtimestamp(mktime(tt))
        timestamp = pd.Timestamp(dd)
        return timestamp

    def __init__(self, model: str, inverter: str, latitude: float,
                longitude: float, **kwargs):
        # super().__init__(**kwargs)

        temperature_model_parameters =
        TEMPERATURE_MODEL_PARAMETERS["sapm"]["open_rack_glass_glass"]
        # Load the database of CEC module model parameters
        modules = pvsystem.retrieve_sam("cecmod")
        # Load the database of CEC inverter model parameters
        inverters = pvsystem.retrieve_sam("cecinverter")

        # A bare bone PV simulator

        # Load the database of CEC module model parameters
        modules = pvsystem.retrieve_sam('cecmod')
        inverters = pvsystem.retrieve_sam('cecinverter')
        module_parameters = modules[model]
        inverter_parameters = inverters[inverter]

        location = pvlocation.Location(latitude=latitude,
                                    longitude=longitude)
        system = pvsystem.PVSystem(module_parameters=module_parameters,
                                  inverter_parameters=inverter_parameters,
                                  temperature_model_parameters=temperature_model_parameters)
        self.modelchain = modelchain.ModelChain(system, location,
                                              aoi_model='no_loss', spectral_model="no_loss")

    def process(self, data):
        weather = pd.read_json(data)
        # print(f"raw_weather: {weather}")
        weather.drop('time.1', axis=1, inplace=True)
        weather['time'] =
        pd.to_datetime(weather['time']).map(datetime.timestamp)  # --> this
        works for the new process_weather code and also the old weather file
        weather["time"] = weather["time"].apply(self.pv_transform_time)
        weather.index = weather["time"]
        # print(f"weather: {weather}")
        # print(weather.dtypes)
        # print(weather['ghi'][0])
        # print(type(weather['ghi'][0]))

        # simulate
        self.modelchain.run_model(weather)
        # print(self.modelchain.results.ac.to_frame().to_json())
        print(self.modelchain.results.ac)

        # good data
        good_data = "{\"time\": {\"12\": \"2010-01-01
        13: 30: 00+00: 00\"}, \"ghi\": {\"12\": 36}, \"dhi\": {\"12\": 36}, \"dni\": {\"12\"        : 0}, \"Tamb\":{\"12\":8.0},\"WindVel\":{\"12\":5.0},\"WindDir\":{\"12\
        ": 270}, \"time.1\":{\"12\":\"2010-01-01 13:30:00+00:00\"}}"

        # data that causes error
        data = "{\"time\": {\"4\": \"2010-01-01
        05: 30: 00+00: 00\"}, \"ghi\": {\"4\": 0}, \"dhi\": {\"4\": 0}, \"dni\": {\"4\": 0}        , \"Tamb\":{\"4\":8.0},\"WindVel\":{\"4\":4.0},\"WindDir\":{\"4\":240},\
        "time.1\":{\"4\":\"2010-01-01 05:30:00+00:00\"}}"
        p1 = PV(model="Trina_Solar_TSM_300DEG5C_07_II_",
              inverter="ABB__MICRO_0_25_I_OUTD_US_208__208V_", latitude=51.204483,
              longitude=5.265472)
        p1.process(good_data)
        print("=====")
        p1.process(data)
