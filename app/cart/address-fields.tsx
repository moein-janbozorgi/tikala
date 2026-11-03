"use client";

import { useState } from "react";
import { CITIES } from "@/lib/cities";
import { PROVINCES } from "@/lib/format";
import { Combobox } from "../combobox";

/** Province + city comboboxes; the city list follows the chosen province. */
export function AddressFields({ province: initialProvince = "", city: initialCity = "" }: { province?: string; city?: string }) {
  const [province, setProvince] = useState(initialProvince);
  const [city, setCity] = useState(initialCity);
  return (
    <>
      <Combobox
        name="province"
        label="استان"
        placeholder="انتخاب کنید"
        required
        hint={() => "استان را از فهرست انتخاب کنید."}
        options={PROVINCES}
        value={province}
        onChange={(p) => {
          setProvince(p);
          // A city from the old province would be wrong now.
          if (p !== province && !CITIES[p.trim()]?.includes(city.trim())) setCity("");
        }}
      />
      <Combobox
        name="city"
        label="شهر"
        placeholder={CITIES[province.trim()] ? "انتخاب یا تایپ کنید" : "ابتدا استان را انتخاب کنید"}
        required
        options={CITIES[province.trim()] ?? []}
        value={city}
        onChange={setCity}
      />
    </>
  );
}
