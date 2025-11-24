import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ModelValidateService, SuggestedTemplate } from '../model-validate/model-validate.service';
import { Subscription } from 'rxjs';
interface TemplateParam { name: string; types: string[]; }
interface TemplateVM {
  data: SuggestedTemplate;
  expanded: boolean;
  grouped?: { [typeUri: string]: TemplateParam[] };
  form?: FormGroup;
}
import { FormGroup, FormControl } from '@angular/forms';
import { TemplateEvaluateService } from '../template-evaluate/template-evaluate.service';
import { ModelDetailService } from '../model-detail/model-detail.service';

@Component({
  selector: 'app-model-validate-templates',
  templateUrl: './model-validate-templates.component.html',
  styleUrls: ['./model-validate-templates.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelValidateTemplatesComponent implements OnInit, OnDestroy {
  @Input() modelId!: number;

  templates: SuggestedTemplate[] = [];
  templateVMs: TemplateVM[] = [];
  private sub?: Subscription;

  constructor(
    private modelValidateService: ModelValidateService,
    private templateEval: TemplateEvaluateService,
    private modelDetailService: ModelDetailService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (typeof this.modelId !== 'number') return;
    // initial from cache (if any)
    this.templates = this.modelValidateService.getCachedTemplates(this.modelId) ?? [];
    this.templateVMs = this.buildVMs(this.templates);
    this.cdr.markForCheck();

    // subscribe to live updates when validation completes
    this.sub = this.modelValidateService.templates$.subscribe(({ modelId, templates }) => {
      if (modelId === this.modelId) {
        this.templates = templates;
        this.templateVMs = this.buildVMs(this.templates);
        this.cdr.markForCheck();
      }
    });
  }

  toggleExpanded(index: number): void {
    const vm = this.templateVMs[index];
    vm.expanded = !vm.expanded;
    if (vm.expanded && !vm.form) {
      const params = Array.isArray(vm.data.parameters) ? (vm.data.parameters as TemplateParam[]) : [];
      vm.grouped = this.groupParams(params);
      vm.form = this.makeForm(params);
    }
  }

  addTemplate(index: number): void {
    const vm = this.templateVMs[index];
    if (!vm?.form) {
      console.error('Form not ready for this template.');
      return;
    }
    const templateId = (vm.data as any)?.id;
    if (typeof templateId !== 'number') {
      console.error('Cannot add: suggested template missing id');
      return;
    }
    const params: { [name: string]: string } = {};
    Object.keys(vm.form.controls).forEach(name => {
      const value = vm.form?.get(name)?.value;
      if (value !== undefined && value !== null && value !== '') {
        params[name] = String(value);
      }
    });

    this.templateEval.evaluateTemplateBindings(templateId, this.modelId, params).subscribe({
      next: (result: string) => {
        this.modelDetailService.updateModelGraph(this.modelId, result, true).subscribe({
          next: () => console.log('Template evaluated and added to model.'),
          error: (err) => console.error('Failed to append evaluated template to model', err),
        });
      },
      error: (err) => console.error('Failed to evaluate template', err),
    });
  }

  private buildVMs(templates: SuggestedTemplate[]): TemplateVM[] {
    return (templates ?? [])
      .filter((t: any) => typeof (t?.id ?? t?.['template_id']) === 'number')
      .map(t => ({ data: { ...(t as any), id: (t as any).id ?? (t as any).template_id } as SuggestedTemplate, expanded: false }));
  }

  private groupParams(params: TemplateParam[]): { [typeUri: string]: TemplateParam[] } {
    const grouped: { [typeUri: string]: TemplateParam[] } = {};
    for (const p of params) {
      const types = Array.isArray(p.types) && p.types.length > 0 ? p.types : ['(untyped)'];
      for (const typeUri of types) {
        if (!grouped[typeUri]) grouped[typeUri] = [];
        grouped[typeUri].push(p);
      }
    }
    return grouped;
  }

  private makeForm(params: TemplateParam[]): FormGroup {
    const controls: { [key: string]: FormControl } = {};
    for (const p of params) {
      controls[p.name] = new FormControl('');
    }
    return new FormGroup(controls);
  }

  // Simplify a URI for display in headers (e.g., "brick:Airflow_Error_Threshold")
  public simplifyUriLabel = (value?: string | null): string => {
    if (!value) return '';
    try {
      let v = String(value).trim();
      if (v.startsWith('<') && v.endsWith('>')) v = v.slice(1, -1);

      const brickPrefixes = [
        'https://brickschema.org/schema/Brick#',
        'http://brickschema.org/schema/Brick#',
      ];
      for (const prefix of brickPrefixes) {
        if (v.startsWith(prefix)) {
          return `brick:${decodeURIComponent(v.slice(prefix.length))}`;
        }
      }

      const hashIdx = v.lastIndexOf('#');
      if (hashIdx >= 0 && hashIdx < v.length - 1) {
        return decodeURIComponent(v.slice(hashIdx + 1));
      }

      v = v.replace(/\/+$/, '');
      const parts = v.split('/');
      const last = parts[parts.length - 1] || '';
      return decodeURIComponent(last);
    } catch {
      return String(value ?? '');
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  trackByIndex(index: number): number {
    return index;
  }
}
