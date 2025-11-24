import { Component, OnInit } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RulesService, AppliedRuleResult, Response } from './rules.service';
import { ModelSearchService } from '../model-search/model-search.service';
import { Model } from '../types';
import { HttpClient } from '@angular/common/http';
import { saveAs } from 'file-saver';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

interface AppliedRuleResultWithID extends AppliedRuleResult {
  id: string
}

interface NestedResults {
  success: "all" | "none" | "some"
  results: {[id: string]: AppliedRuleResultWithID}
  selected: "all" | "none" | "some";
}

@Component({
  selector: 'app-rules',
  templateUrl: './rules.component.html',
  providers: [RulesService],
  styleUrls: ['./rules.component.css']
})
export class RulesComponent implements OnInit {
  isLoading: boolean = false;
  models: Model[] = [];
  selectedModelId: number | null = null;
  rulesJson: File | null = null;
  // ground truth of results
  results: AppliedRuleResultWithID[] = [];
  report: string = '';
  // AFXML export state
  isExportingAFXML: boolean = false;
  afxmlUrl: string | null = null;
  afxmlSafeUrl: SafeUrl | null = null;
  afxmlFilename: string = 'rules.afxml';
  // PI AF config fields
  piServer: string = '';
  piDatabase: string = '';
  piExportPath: string = '';
  piImportPath: string = '';
  // ground truth of whats selected, default to all true
  selectedByID: {[id: string]: boolean} = this.results.reduce((acc, curr) => {
    return {...acc, [curr.id]: true}
  }, {});
  // connivent representations
  resultsByRule: Record<string, NestedResults> = {};
  resultsByFocusNode: Record<string, NestedResults> = {};
  colorBySuccess = {'all': "#D9E8D9", "some": "#F6DDA2", "none": "#ECC1C1"}

  constructor(
    private RulesService: RulesService,
    private modelSearchService: ModelSearchService,
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) { }

  ngOnInit(): void {
    if (this.results?.length) {
      this.initResultsByRule()
      this.initResultsByFocusNode()
    }
    this.modelSearchService.getAllModels().subscribe({
      next: (models) => {
        this.models = models;
      },
      error: (error) => {
        console.error('Error fetching models:', error);
      }
    });
  }
  viewReport() {
    const newWindow = window.open();

    const html: string | Promise<string> = marked.parse(this.report);
    // turn 'html' into a promise<string> if it's not already
    const htmlPromise = typeof html === 'string' ? Promise.resolve(html) : html;

    if (newWindow) {
      htmlPromise.then((html) => {
        const sanitizedHtml = DOMPurify.sanitize(html);
        newWindow.document.write(sanitizedHtml);
        newWindow.document.close();
      });
    }
  }

  downloadReport() {
    const blob = new Blob([this.report], { type: 'text/markdown' });
    saveAs(blob, 'report.md');
  }

  generateAFXML() {
    if (!this.selectedModelId || !this.rulesJson) return;
    this.isExportingAFXML = true;

    if (this.afxmlUrl) {
      URL.revokeObjectURL(this.afxmlUrl);
      this.afxmlUrl = null;
      this.afxmlSafeUrl = null;
    }

    this.RulesService.exportAFXML(
      Number(this.selectedModelId),
      this.rulesJson,
      this.piServer,
      this.piDatabase,
      this.piExportPath || undefined,
      this.piImportPath || undefined
    ).subscribe({
      next: (blob: Blob) => {
        this.afxmlFilename = `rules_${this.selectedModelId}.afxml`;
        const xmlBlob = new Blob([blob], { type: 'application/xml;charset=utf-8' });

        // Auto-download and also expose a sanitized link for re-download
        saveAs(xmlBlob, this.afxmlFilename);

        // Clean up any previously created object URLs
        if (this.afxmlUrl) {
          URL.revokeObjectURL(this.afxmlUrl);
        }
        const url = URL.createObjectURL(xmlBlob);
        this.afxmlUrl = url;
        this.afxmlSafeUrl = this.sanitizer.bypassSecurityTrustUrl(url);

        this.isExportingAFXML = false;
      },
      error: (err) => {
        console.error('Error generating AFXML:', err);
        this.isExportingAFXML = false;
      }
    });
  }

  handleRulesJsonInput(e: Event) { this.rulesJson = (e?.target as HTMLInputElement)?.files?.[0] ?? null }

  sendFiles() {
    if (!this.selectedModelId || !this.rulesJson) return;
    this.isLoading = true;
    this.RulesService.sendFiles(this.selectedModelId, this.rulesJson)
      .subscribe({
        next: (data: Response) => {
          this.results = data.results.map((d, i) => {return {...d, id: i.toString()}});
          this.report = data.report;

          console.log(this.results);

          this.selectedByID = this.results.reduce((acc, curr) => {
            return {...acc, [curr.id]: true}
          }, {});
          this.initResultsByRule();
          this.initResultsByFocusNode();
          this.isLoading = false;
        }, // success path
        error: (error) => {
          this.isLoading = false;
          console.error('Error sending files:', error);
        } // error path
      });
  }

  initResultsByRule(){
    this.resultsByRule = this.results.reduce((acc, curr) => {
      acc[curr.rule] ||= {success: "all", results: {}, selected: "all"}
      acc[curr.rule].results[curr.id] = curr;
      return acc
    }, {} as Record<string, NestedResults>);

    Object.values(this.resultsByRule).forEach(nr => {this.setSuccess(nr)})
  }

  initResultsByFocusNode(){
    this.resultsByFocusNode = this.results.reduce((acc, curr) => {
      acc[curr.focus_node] ||= {success: "all", results: {}, selected: "all"}
      acc[curr.focus_node].results[curr.id] = curr;
      return acc
    }, {} as Record<string, NestedResults>);

    Object.values(this.resultsByFocusNode).forEach(nr => {this.setSuccess(nr)})
  }

  setSuccess(nr: NestedResults){
    const successes = Object.values(nr.results).map(r => r.success)
    if(successes.every(s => s)) nr.success = "all"
    else if(successes.every(s => !s)) nr.success = "none"
    else  nr.success = "some"
  }

  toggleSelected(r: AppliedRuleResultWithID){
    this.selectedByID[r.id] = !this.selectedByID[r.id];
    this.setSelected(this.resultsByFocusNode[r.focus_node])
    this.setSelected(this.resultsByRule[r.rule])
  }

  toggleSelectedForNestedResult(nr: NestedResults, nestedBy: "rule" | "focusNode"){
    if (nr.selected == "none") nr.selected = "all";
    else nr.selected = "none";
    Object.values(nr.results).forEach(r => {
      this.selectedByID[r.id] = (nr.selected == "all")
      if (nestedBy == "rule") this.setSelected(this.resultsByFocusNode[r.focus_node])
      else this.setSelected(this.resultsByRule[r.rule])
    })
  }

  setSelected(nr: NestedResults){
    const selected = Object.values(nr.results).map(r => this.selectedByID[r.id]);
    if(selected.every(s => s)) nr.selected = "all"
    else if(selected.every(s => !s)) nr.selected = "none"
    else  nr.selected = "some"
  }

  selectAll(){
    Object.keys(this.selectedByID).forEach(k => this.selectedByID[k] = true);
    Object.values(this.resultsByRule).forEach(nr => nr.selected = "all")
    Object.values(this.resultsByFocusNode).forEach(nr => nr.selected = "all")
  }
  deselectAll(){
    Object.keys(this.selectedByID).forEach(k => this.selectedByID[k] = false);
    Object.values(this.resultsByRule).forEach(nr => nr.selected = "none")
    Object.values(this.resultsByFocusNode).forEach(nr => nr.selected = "none")
  }
  selectApplicableOnly(){
    this.results.forEach(r => this.selectedByID[r.id] = r.success)
    Object.values(this.resultsByRule).forEach(nr => this.setSelected(nr))
    Object.values(this.resultsByFocusNode).forEach(nr => this.setSelected(nr))
  }

  detailsToList(details: any): string[] {
    if (details === null || details === undefined) {
      return [];
    }

    if (Array.isArray(details)) {
      const rows = details.map((item) => this.stringifyDetail(item)).filter((item) => item.length);
      return this.uniqueDetails(rows);
    }

    if (typeof details === 'object') {
      const rows = Object.entries(details)
        .map(([key, value]) => {
          const valueString = this.stringifyDetail(value);
          return valueString ? `${key}: ${valueString}` : key;
        })
        .filter((item) => item.length);
      return this.uniqueDetails(rows);
    }

    const valueString = this.stringifyDetail(details);
    return this.uniqueDetails(valueString ? [valueString] : []);
  }

  private stringifyDetail(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.stringifyDetail(item)).filter((item) => item.length).join(', ');
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }

    return String(value);
  }

  private uniqueDetails(entries: string[]): string[] {
    const seen = new Set<string>();
    const deduped: string[] = [];
    entries.forEach((entry) => {
      const key = entry.trim();
      if (!key.length || seen.has(key)) {
        return;
      }
      seen.add(key);
      deduped.push(entry);
    });
    return deduped;
  }

  clearResults() {
    this.results = [];
    this.selectedByID = {};
    this.resultsByRule = {};
    this.resultsByFocusNode = {};
    if (this.afxmlUrl) {
      URL.revokeObjectURL(this.afxmlUrl);
      this.afxmlUrl = null;
    }
  }

  downloadFile() {
    const blob = new Blob([
      JSON.stringify(
        Object.entries(this.resultsByRule).reduce((acc, [rule, nr]) => {
          acc[rule] = Object.entries(nr.results).filter(([id, _]) => this.selectedByID[id]).map(([_, r]) => r.focus_node)
          return acc
        }, {} as {[rule: string]: string[]})
      )
    ], { type: 'text/json' });
    saveAs(blob, "rule_set.json");
  }
}
