"use client";

import Link from "next/link";
import { useState } from "react";
import { archiveMember, createMember } from "@/lib/gym/actions";
import { PlanDurationFields } from "@/components/plan-duration-fields";

type MemberRow = {
  id: string;
  member_code: string;
  full_name: string;
  phone: string | null;
  member_status: "active" | "inactive" | "archived";
  joining_date: string;
  plan_name: string | null;
  start_date: string | null;
  end_date: string | null;
  membership_status:
    | "active"
    | "expiring"
    | "expired"
    | "cancelled"
    | "none";
};

type Plan = {
  id: string;
  name: string;
  duration_days: number;
};

type Props = {
  rows: MemberRow[];
  count: number;
  page: number;
  totalPages: number;
  q: string;
  memberStatus: string;
  membershipStatus: string;
  plans: Plan[];
  plansError: boolean;
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function pageUrl(
  page: number,
  q: string,
  memberStatus: string,
  membershipStatus: string,
) {
  const params = new URLSearchParams();

  if (q) params.set("q", q);
  if (memberStatus) params.set("status", memberStatus);
  if (membershipStatus) params.set("membership", membershipStatus);
  params.set("page", String(page));

  return `/gym/members?${params.toString()}`;
}

export default function MemberDirectory({
  rows,
  count,
  page,
  totalPages,
  q,
  memberStatus,
  membershipStatus,
  plans,
  plansError,
}: Props) {
  const [showAddMember, setShowAddMember] = useState(false);

  const filters = [
    { label: "All", membership: "" },
    { label: "Active", membership: "active" },
    { label: "Expiring", membership: "expiring" },
    { label: "Expired", membership: "expired" },
  ];

  return (
    <section className="members-workspace">
      <div className="members-toolbar">
        <div>
          <p className="members-eyebrow">Gym workspace</p>
          <h1>Members</h1>
          <p className="members-description">
            Manage your members, memberships and renewals in one place.
          </p>
        </div>

        <button
          className="members-add-button"
          type="button"
          onClick={() => setShowAddMember(true)}
        >
          + Add member
        </button>
      </div>

      <div className="members-filters">
        {filters.map((filter) => {
          const active =
            membershipStatus === filter.membership &&
            !memberStatus;

          return (
            <Link
              key={filter.label}
              href={pageUrl(
                1,
                q,
                "",
                filter.membership,
              )}
              className={active ? "members-filter active" : "members-filter"}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      <form className="members-search" action="/gym/members">
        <div className="members-search-input">
          <span aria-hidden="true">⌕</span>
          <input
            name="q"
            defaultValue={q}
            maxLength={80}
            placeholder="Search name, phone or member ID"
            aria-label="Search members"
          />
        </div>

        <select
          name="membership"
          defaultValue={membershipStatus}
          aria-label="Filter membership"
        >
          <option value="">All memberships</option>
          <option value="active">Active</option>
          <option value="expiring">Expiring</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
          <option value="none">No membership</option>
        </select>

        <button type="submit" className="members-search-button">
          Search
        </button>
      </form>

      <div className="members-summary">
        <span>{count} members</span>
        <span>Page {page} of {totalPages}</span>
      </div>

      <div className="member-card-list">
        {rows.length === 0 ? (
          <div className="members-empty">
            <div className="members-empty-icon">◎</div>
            <h3>No members found</h3>
            <p>
              {q || memberStatus || membershipStatus
                ? "Try changing your search or filters."
                : "Add your first member to start building this gym's directory."}
            </p>
          </div>
        ) : (
          rows.map((member) => {
            const status =
              member.membership_status === "none"
                ? member.member_status
                : member.membership_status;

            return (
              <article className="member-card" key={member.id}>
                <div className="member-avatar" aria-hidden="true">
                  {initials(member.full_name)}
                </div>

                <div className="member-main">
                  <Link
                    href={`/gym/members/${member.id}`}
                    className="member-name"
                  >
                    {member.full_name}
                  </Link>

                  <div className="member-meta">
                    <span>{member.member_code}</span>
                    <span>•</span>
                    <span>{member.phone || "No phone"}</span>
                  </div>

                  <div className="member-membership">
                    {member.plan_name || "No membership"}
                    {member.end_date && (
                      <>
                        <span>•</span>
                        <span>
                          Expires {formatDate(member.end_date)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="member-status-column">
                  <span className={`member-status ${status}`}>
                    {status.replaceAll("_", " ")}
                  </span>

                  {member.membership_status === "expired" && (
                    <Link
                      href={`/gym/members/${member.id}?edit=1`}
                      className="member-renew-link"
                    >
                      Renew
                    </Link>
                  )}
                </div>

                <div className="member-actions">
                  <Link
                    className="member-action"
                    href={`/gym/members/${member.id}`}
                  >
                    View
                  </Link>

                  <Link
                    className="member-action secondary"
                    href={`/gym/members/${member.id}?edit=1`}
                  >
                    Edit
                  </Link>

                  {member.member_status !== "archived" && (
                    <form action={archiveMember}>
                      <input
                        type="hidden"
                        name="id"
                        value={member.id}
                      />
                      <button className="member-action danger" type="submit">
                        Archive
                      </button>
                    </form>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className="members-pagination">
        <span>
          {count} members · Page {page} of {totalPages}
        </span>

        <div>
          {page > 1 ? (
            <Link
              href={pageUrl(
                page - 1,
                q,
                memberStatus,
                membershipStatus,
              )}
            >
              Previous
            </Link>
          ) : (
            <span className="disabled">Previous</span>
          )}

          {page < totalPages ? (
            <Link
              href={pageUrl(
                page + 1,
                q,
                memberStatus,
                membershipStatus,
              )}
            >
              Next
            </Link>
          ) : (
            <span className="disabled">Next</span>
          )}
        </div>
      </div>

      {showAddMember && (
        <div
          className="member-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowAddMember(false);
            }
          }}
        >
          <div
            className="member-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-member-title"
          >
            <div className="member-modal-header">
              <div>
                <p className="members-eyebrow">New member</p>
                <h2 id="add-member-title">Add member</h2>
              </div>

              <button
                type="button"
                className="member-modal-close"
                onClick={() => setShowAddMember(false)}
                aria-label="Close add member dialog"
              >
                ×
              </button>
            </div>

            {plansError ? (
              <div className="members-empty compact">
                <h3>Plans unavailable</h3>
                <p>Membership plans could not be loaded.</p>
              </div>
            ) : plans.length === 0 ? (
              <div className="members-empty compact">
                <h3>Create a plan first</h3>
                <p>
                  Create an active membership plan before adding a member.
                </p>
                <Link className="button button-primary" href="/gym/plans">
                  Open plans
                </Link>
              </div>
            ) : (
              <form className="member-form" action={createMember}>
                <div className="member-photo-placeholder">
                  <div className="member-avatar large">+</div>
                  <div>
                    <strong>Member photo</strong>
                    <p>Photo upload will be added in the next step.</p>
                  </div>
                </div>

                <div className="member-form-grid">
                  <label>
                    Full name *
                    <input
                      name="full_name"
                      required
                      maxLength={160}
                      autoComplete="name"
                    />
                  </label>

                  <label>
                    Phone *
                    <input
                      name="phone"
                      type="tel"
                      required
                      minLength={7}
                      maxLength={40}
                      autoComplete="tel"
                    />
                  </label>

                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      maxLength={254}
                      autoComplete="email"
                    />
                  </label>

                  <label>
                    Gender
                    <select name="gender" defaultValue="">
                      <option value="">Choose</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="non_binary">Non-binary</option>
                      <option value="prefer_not_to_say">
                        Prefer not to say
                      </option>
                    </select>
                  </label>

                  <label>
                    Date of birth
                    <input name="date_of_birth" type="date" />
                  </label>

                  <label>
                    Joining date *
                    <input
                      name="joining_date"
                      type="date"
                      required
                    />
                  </label>

                  <label className="full">
                    Address
                    <textarea name="address" rows={2} maxLength={500} />
                  </label>

                  <div className="full">
                    <PlanDurationFields
                      plans={plans}
                      defaultStartDate={""}
                    />
                  </div>

                  <label className="full">
                    Notes
                    <textarea name="notes" rows={2} maxLength={2000} />
                  </label>
                </div>

                <div className="member-modal-actions">
                  <button
                    className="member-action secondary"
                    type="button"
                    onClick={() => setShowAddMember(false)}
                  >
                    Cancel
                  </button>

                  <button
                    className="members-add-button"
                    type="submit"
                  >
                    Create member
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}