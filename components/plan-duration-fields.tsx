"use client";

import { useMemo, useState } from "react";
import { calculateMembershipEndDate } from "@/lib/gym/membership-dates.js";

type PlanOption = { id: string; name: string; duration_days: number };

export function PlanDurationFields({ plans, defaultStartDate = "", startFieldName = "membership_start_date" }: { plans: PlanOption[]; defaultStartDate?: string; startFieldName?: string }) {
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const endDate = useMemo(
    () => selectedPlan ? calculateMembershipEndDate(startDate, selectedPlan.duration_days) || "" : "",
    [selectedPlan, startDate],
  );

  return <>
    <label>Membership plan<select name="membership_plan_id" required value={planId} onChange={(event) => setPlanId(event.target.value)}>
      <option value="">Choose a plan</option>
      {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.duration_days} days</option>)}
    </select></label>
    <div className="form-grid">
      <label>Membership start date<input name={startFieldName} type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
      <label>Membership end date<input type="date" value={endDate} readOnly aria-readonly="true" /></label>
    </div>
  </>;
}
