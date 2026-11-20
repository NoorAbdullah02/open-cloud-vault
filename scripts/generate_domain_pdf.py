#!/usr/bin/env python3
import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(54, 750, "Complete Guide: Free Custom Developer Domain (.is-a.dev) & Unlimited Subdomains")
            self.setStrokeColor(colors.HexColor("#E2E8F0"))
            self.setLineWidth(0.5)
            self.line(54, 742, 612 - 54, 742)
            
        # Footer
        footer_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(612 - 54, 36, footer_text)
        self.drawString(54, 36, "NOOR DRIVE Open Source Ecosystem • Sheikh Noor Abdullah")
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.5)
        self.line(54, 46, 612 - 54, 46)
        
        self.restoreState()

def build_pdf(filename="docs/HOW_TO_GET_FREE_DOMAIN.pdf"):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()
    
    # Custom Palette
    PRIMARY = colors.HexColor("#1E293B")
    ACCENT = colors.HexColor("#2563EB")
    ACCENT_LIGHT = colors.HexColor("#EFF6FF")
    TEXT = colors.HexColor("#334155")
    CODE_BG = colors.HexColor("#F1F5F9")
    BORDER_COLOR = colors.HexColor("#CBD5E1")
    
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=PRIMARY,
        spaceAfter=6
    )
    
    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#475569"),
        spaceAfter=15
    )
    
    meta_style = ParagraphStyle(
        "MetaText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#64748B"),
        spaceAfter=15
    )

    h1_style = ParagraphStyle(
        "H1",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=PRIMARY,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )
    
    h2_style = ParagraphStyle(
        "H2",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=15,
        textColor=ACCENT,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13.5,
        textColor=TEXT,
        spaceAfter=6
    )

    bullet_style = ParagraphStyle(
        "Bullet",
        parent=body_style,
        leftIndent=14,
        bulletIndent=4,
        spaceAfter=4
    )

    code_style = ParagraphStyle(
        "Code",
        parent=styles["Normal"],
        fontName="Courier",
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor("#0F172A")
    )
    
    alert_style = ParagraphStyle(
        "Alert",
        parent=body_style,
        fontSize=9,
        leading=12.5,
        textColor=colors.HexColor("#1E3A8A")
    )

    table_cell = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=TEXT
    )

    table_header = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.white
    )

    story = []

    # Title & Metadata
    story.append(Paragraph("How to Claim a 100% Free Custom Developer Domain (.is-a.dev) & Unlimited Subdomains", title_style))
    story.append(Paragraph("A Comprehensive Master Guide from First to Last: Registration, GitHub PRs, Hosting Setup & Architecture", subtitle_style))
    story.append(Paragraph("<b>Author:</b> Sheikh Noor Abdullah • <b>Project:</b> NOOR DRIVE Ecosystem • <b>Official Registry:</b> github.com/is-a-dev/register", meta_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT, spaceAfter=14))

    # Introduction
    story.append(Paragraph("1. Introduction & Overview", h1_style))
    story.append(Paragraph(
        "Custom domains usually require annual recurring payments ($10–$25/yr) and credit card verification. For students, competitive programmers, and independent developers, this poses an unnecessary friction barrier. "
        "<b>is-a.dev</b> provides an official, community-driven, 100% free forever top-tier developer subdomain service with native Cloudflare DNS routing, free SSL certificates, and zero maintenance fees.",
        body_style
    ))
    story.append(Paragraph(
        "<b>Core Highlights:</b><br/>"
        "• <b>Lifetime Free:</b> No renewal fees, no credit card, no corporate advertisements.<br/>"
        "• <b>Full DNS Flexibility:</b> Supports CNAME, A, AAAA, TXT, MX, CAA, and SRV records.<br/>"
        "• <b>High Security:</b> Transparent GitHub Pull Request workflow backed by Cloudflare Anycast CDN.<br/>"
        "• <b>Unlimited Subdomains:</b> Once you own your root domain, you can create unlimited nested subdomains for all your apps and APIs.",
        body_style
    ))

    # Prerequisites
    story.append(Paragraph("2. Prerequisites Before Applying", h1_style))
    story.append(Paragraph("• <b>GitHub Account:</b> The domain is permanently anchored to your GitHub username.", bullet_style))
    story.append(Paragraph("• <b>Live Website:</b> Your portfolio or application must be deployed and publicly reachable (e.g. Render, Vercel, Netlify, or GitHub Pages). <i>Placeholder or blank 'Under Construction' sites are immediately denied.</i>", bullet_style))
    story.append(Paragraph("• <b>Software Development Related:</b> Your root domain must showcase your software engineering projects, portfolio, or open-source tooling.", bullet_style))

    # Phase 1
    story.append(Spacer(1, 8))
    story.append(Paragraph("3. Phase 1 — Claiming Your Root Subdomain (e.g. yourname.is-a.dev)", h1_style))
    
    story.append(Paragraph("Step 1: Check Domain Availability", h2_style))
    story.append(Paragraph("Before creating files, verify that your desired name is available. Open your browser and navigate to: <font color='#2563EB'>https://is-a.dev/available?d=yourname</font>. If the page confirms availability, you are ready to register.", body_style))

    story.append(Paragraph("Step 2: Fork the Official Registry", h2_style))
    story.append(Paragraph("Navigate to <b>https://github.com/is-a-dev/register</b> and click the <b>Fork</b> button in the top-right corner to create a copy under your personal GitHub profile.", body_style))

    story.append(Paragraph("Step 3: Create the Domain JSON Record", h2_style))
    story.append(Paragraph("Inside your forked repository, navigate into the <b>domains/</b> directory and create a new file named <b>yourname.json</b> (e.g., <code>noor.json</code>).", body_style))

    # Code snippet box
    code_text = """{
  "owner": {
    "username": "YourGitHubUsername",
    "email": "your-email@gmail.com"
  },
  "records": {
    "CNAME": "your-app.onrender.com"
  }
}"""
    code_table = Table([[Paragraph(code_text.replace("\n", "<br/>").replace(" ", "&nbsp;"), code_style)]], colWidths=[500])
    code_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), CODE_BG),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(code_table)
    story.append(Spacer(1, 6))

    story.append(Paragraph("Step 4: Submit the Pull Request (PR)", h2_style))
    story.append(Paragraph("Open a Pull Request from your fork into <code>is-a-dev/register:main</code>. Title your PR: <code>Register yourname.is-a.dev</code>. Fill out the PR template carefully: mark all required checkboxes with <code>[x]</code>, insert your live preview link between <code>WEBSITE_PREVIEW_START</code> and <code>WEBSITE_PREVIEW_END</code>, and state the website purpose. Automated CI tests will validate your JSON syntax.", body_style))

    story.append(Paragraph("Step 5: Connect to Hosting Provider", h2_style))
    story.append(Paragraph("Once maintainers merge your PR (typically within a few hours to 3 days), map the domain in your cloud provider:", body_style))
    story.append(Paragraph("• <b>Render:</b> Web Service > Settings > Custom Domains > Add <code>yourname.is-a.dev</code>.", bullet_style))
    story.append(Paragraph("• <b>Vercel:</b> Project Settings > Domains > Add <code>yourname.is-a.dev</code>.", bullet_style))
    story.append(Paragraph("• <b>GitHub Pages:</b> Repository Settings > Pages > Custom Domain > Check 'Enforce HTTPS'.", bullet_style))

    # Phase 2
    story.append(Spacer(1, 10))
    story.append(Paragraph("4. Phase 2 — How to Create Unlimited Subdomains (e.g. drive.yourname.is-a.dev)", h1_style))
    story.append(Paragraph(
        "This is the most powerful capability of <code>is-a.dev</code>: once your root domain (e.g. <code>noor.is-a.dev</code>) is approved, <b>you can register unlimited nested subdomains</b> for any project, cloud storage, API, or bot without portfolio restrictions!",
        body_style
    ))

    story.append(Paragraph("The 3 Golden Rules for Subdomains:", h2_style))
    story.append(Paragraph("1. <b>Parent Ownership Rule:</b> The <code>owner.username</code> in the subdomain file must strictly match the root domain's owner.", bullet_style))
    story.append(Paragraph("2. <b>File Naming Convention:</b> The file must follow <code>[subdomain].[parent].json</code>. For example, to get <code>drive.noor.is-a.dev</code>, the file name is <b>domains/drive.noor.json</b>.", bullet_style))
    story.append(Paragraph("3. <b>Multi-Tier Nesting:</b> You can nest subdomains as deeply as needed (e.g. <code>v1.api.noor.json</code> for <code>https://v1.api.noor.is-a.dev</code>).", bullet_style))

    story.append(Spacer(1, 4))
    story.append(Paragraph("Step-by-Step Subdomain Creation Flow:", h2_style))
    story.append(Paragraph("1. Open your fork of <code>is-a-dev/register</code> and click <b>Sync Fork</b> to fetch the latest upstream commits.", bullet_style))
    story.append(Paragraph("2. Inside <code>domains/</code>, create a new file named <code>subname.yourname.json</code> (e.g. <code>drive.noor.json</code>).", bullet_style))
    story.append(Paragraph("3. Add your target CNAME or A record pointing to the application backend/frontend.", bullet_style))
    story.append(Paragraph("4. Submit the PR with title <code>Register drive.noor.is-a.dev</code>. The automated bot checks will recognize your parent ownership and mark the tests as SUCCESS.", bullet_style))
    story.append(Paragraph("5. Add the subdomain to your hosting service (e.g. Render Custom Domains). SSL will be automatically provisioned.", bullet_style))

    # Architecture Table
    story.append(Spacer(1, 8))
    story.append(Paragraph("Example Multi-App Architecture Setup:", h2_style))

    arch_data = [
        [Paragraph("Subdomain Target", table_header), Paragraph("Service Type", table_header), Paragraph("Hosting Platform", table_header), Paragraph("DNS Record Type", table_header)],
        [Paragraph("<b>noor.is-a.dev</b>", table_cell), Paragraph("Main Portfolio & CV", table_cell), Paragraph("Render / Vercel", table_cell), Paragraph("CNAME -> noor-portfolio.onrender.com", table_cell)],
        [Paragraph("<b>drive.noor.is-a.dev</b>", table_cell), Paragraph("Cloud Vault & Storage", table_cell), Paragraph("Render Web App", table_cell), Paragraph("CNAME -> noor-cloud-vault.onrender.com", table_cell)],
        [Paragraph("<b>api.noor.is-a.dev</b>", table_cell), Paragraph("Backend REST API", table_cell), Paragraph("Railway / Render", table_cell), Paragraph("CNAME -> api.railway.app", table_cell)],
        [Paragraph("<b>docs.noor.is-a.dev</b>", table_cell), Paragraph("Technical Guides", table_cell), Paragraph("Cloudflare Pages", table_cell), Paragraph("CNAME -> noor-docs.pages.dev", table_cell)],
        [Paragraph("<b>bot.noor.is-a.dev</b>", table_cell), Paragraph("Telegram / Discord Bot", table_cell), Paragraph("VPS / Fly.io", table_cell), Paragraph("A -> [Dedicated Server IP]", table_cell)],
    ]
    arch_table = Table(arch_data, colWidths=[120, 120, 110, 150])
    arch_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(arch_table)

    # Troubleshooting & FAQ
    story.append(Spacer(1, 10))
    story.append(Paragraph("5. Troubleshooting & Frequently Asked Questions (FAQ)", h1_style))

    faq_data = [
        [Paragraph("Symptom / Error", table_header), Paragraph("Root Cause", table_header), Paragraph("Verified Resolution", table_header)],
        [
            Paragraph("<b>PR Denied: 'Not Related to Software Development'</b>", table_cell),
            Paragraph("Applied for a standalone project/tool name as root subdomain instead of personal developer portfolio.", table_cell),
            Paragraph("Use your developer name/username as root subdomain (e.g. <code>noor.is-a.dev</code>). Put project apps under nested subdomains.", table_cell)
        ],
        [
            Paragraph("<b>'Parent subdomain does not exist'</b>", table_cell),
            Paragraph("Attempted to register a subdomain before the root domain PR was approved and merged.", table_cell),
            Paragraph("Wait until your root domain PR is fully merged into main before opening nested subdomain PRs.", table_cell)
        ],
        [
            Paragraph("<b>'Owner does not match parent'</b>", table_cell),
            Paragraph("GitHub username spelled differently or created from a secondary GitHub profile.", table_cell),
            Paragraph("Ensure <code>owner.username</code> is identical to the root domain's owner field.", table_cell)
        ],
        [
            Paragraph("<b>Domain still redirects to is-a.dev home</b>", table_cell),
            Paragraph("Local browser DNS cache has not updated yet.", table_cell),
            Paragraph("Clear browser cache or press <code>Ctrl+F5</code>. Check via mobile data or in incognito window.", table_cell)
        ],
        [
            Paragraph("<b>SSL Certificate Not Valid Yet</b>", table_cell),
            Paragraph("Cloudflare / Let's Encrypt challenge in progress (takes 5-15 minutes).", table_cell),
            Paragraph("Wait 10 minutes after adding the custom domain in Render/Vercel settings. It will turn green automatically.", table_cell)
        ]
    ]
    faq_table = Table(faq_data, colWidths=[140, 160, 200])
    faq_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(faq_table)

    story.append(Spacer(1, 14))
    story.append(Paragraph(
        "<para align='center'><b>NOOR DRIVE Open Source Ecosystem • Documentation Series</b><br/>"
        "Created with ❤️ for students, developers, and open-source creators worldwide.<br/>"
        "Official Repository: <font color='#2563EB'>https://github.com/NoorAbdullah02/open-cloud-vault</font></para>",
        meta_style
    ))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated {filename}")

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "docs/HOW_TO_GET_FREE_DOMAIN.pdf"
    build_pdf(out)
