'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/src/lib/i18n';
import { ProductCard } from '@/src/components/ProductCard';
import type { Product, BuyingPlanRow } from '@/src/lib/types';
import Link from 'next/link';
import { useToday } from '@/src/lib/useToday';

interface PlanRowWithProgress extends BuyingPlanRow {
  qty_bought: number;
  avg_rate_paise: number | null;
  qty_remaining: number;
}

export default function BuyingPlanPage() {
  const { t, formatPaise } = useI18n();
  const [plan, setPlan] = useState<PlanRowWithProgress[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const today = useToday();

  useEffect(() => {
    if (!today) return;
    async function load() {
      try {
        setLoading(true);
        const [planRes, refRes] = await Promise.all([
          fetch(`/api/buyer/plan?date=${today}`),
          fetch('/api/reference?tables=products'),
        ]);

        if (!planRes.ok) throw new Error('Failed to load plan');
        if (!refRes.ok) throw new Error('Failed to load products');

        const planData = await planRes.json();
        const refData = await refRes.json();

        setPlan(planData);
        setProducts(refData.products || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [today]);

  const getProduct = (id: string) => products.find(p => p.id === id);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-slate-400">{t.common.loading}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <div className="text-red-400">{error}</div>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
        >
          {t.common.retry}
        </button>
      </div>
    );
  }

  if (plan.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <span className="text-4xl">📋</span>
        <p className="text-slate-400">No orders for today yet.</p>
        <p className="text-sm text-slate-600">The owner needs to enter or approve today&apos;s order first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-white">{t.buyer.plan_title}</h2>
      <p className="text-sm text-slate-400">{today}</p>

      {plan.map((row) => {
        const product = getProduct(row.product_id);
        if (!product) return null;

        const unitLabel = product.unit === 'kg' ? t.common.kg : t.common.pcs;
        const progress = row.qty_to_buy > 0 ? row.qty_bought / row.qty_to_buy : 1;
        const metric = `${t.buyer.still_needed}: ${row.qty_remaining} ${unitLabel}`;
        const detail = `${t.buyer.needed}: ${row.qty_to_buy} · ${t.buyer.bought}: ${row.qty_bought} ${unitLabel}`;
        const warning = row.too_high ? t.buyer.too_high_warning : undefined;

        return (
          <Link key={row.product_id} href={`/buyer/purchase?product=${row.product_id}`}>
            <ProductCard
              product={product}
              metric={metric}
              detail={detail}
              progress={progress}
              warning={warning}
            >
              {row.avg_rate_paise && (
                <p className="mt-1 text-xs text-slate-500">
                  {t.buyer.avg_rate}: {formatPaise(row.avg_rate_paise)}/{unitLabel}
                </p>
              )}
            </ProductCard>
          </Link>
        );
      })}
    </div>
  );
}
