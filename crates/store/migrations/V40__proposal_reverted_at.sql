-- Person undid an accept via object PATCH; card shows Reverted instead of Approved by you.
ALTER TABLE proposals ADD COLUMN reverted_at timestamptz;
