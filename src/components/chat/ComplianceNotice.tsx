import { COMPLIANCE_NOTICE_SHORT } from "@/lib/chat/compliance";

/** PRD §5.3.7：场景 Tab 上方常驻合规短句 */
export function ComplianceNotice() {
  return (
    <p className="text-xs leading-normal text-[#a39e98] text-center px-1">
      {COMPLIANCE_NOTICE_SHORT}
    </p>
  );
}
