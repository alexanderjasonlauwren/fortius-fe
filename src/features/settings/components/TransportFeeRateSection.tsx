/**
 * Tarif Transport Fee: the Rp per kg Pertamina pays the agent for the LPG it
 * loads, as the monthly BA LO prices it (Rp 354,64/kg in March 2026). Each
 * rate holds from its date until the next one, so a rate change mid-month
 * prices each LO at the rate of its own day.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProducts } from "@/features/products/api/productApi";
import { TransportTariffPanel } from "@/features/products/components/TransportTariffPanel";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { Field, SelectInput } from "@/components/common/Field";
import { scopeKey } from "@/lib/scope";

export function TransportFeeRateSection() {
  const products = useQuery({
    queryKey: [...scopeKey(), "products", "commodity"],
    queryFn: () => getProducts({ onlyActive: true }),
  });
  const commodities = (products.data ?? []).filter((p) => p.productKind === "commodity");
  // LPG 3 kg is the product the BA LO bills; preselect it.
  const lpg3 = commodities.find((p) => /3\s*kg/i.test(`${p.nama} ${p.kode}`)) ?? commodities[0];
  const [chosen, setChosen] = useState("");
  const productId = chosen || lpg3?.id || "";

  return (
    <Panel>
      <PanelHeader
        title="Tarif Transport Fee"
        hint="Rp per kg yang dibayar Pertamina untuk BA LO. Tarif baru berlaku mulai tanggalnya; LO sebelum tanggal itu tetap memakai tarif lama."
      />
      <PanelBody className="space-y-4">
        {products.isLoading ? (
          <Skeleton className="h-10 w-64" />
        ) : commodities.length > 1 ? (
          <Field label="Produk" htmlFor="tf-product" hint="Produk yang ditagihkan transport fee-nya">
            <SelectInput id="tf-product" value={productId} onChange={(e) => setChosen(e.target.value)}>
              {commodities.map((p) => (
                <option key={p.id} value={p.id}>{p.kode} · {p.nama}</option>
              ))}
            </SelectInput>
          </Field>
        ) : null}
        {productId ? (
          <TransportTariffPanel productId={productId} fixedBasis="per_kg" className="" />
        ) : (
          !products.isLoading && <p className="text-sm text-ink-muted">Belum ada produk komoditas.</p>
        )}
      </PanelBody>
    </Panel>
  );
}
