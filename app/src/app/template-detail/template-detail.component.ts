import { Component, OnInit, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Template } from '../types'
import {TemplateDetailService} from './template-detail.service'
import { TemplateNetworkComponent } from '../template-network/template-network.component'
import { API_URL } from '../env'

@Component({
  selector: 'app-template-detail',
  templateUrl: './template-detail.component.html',
  providers: [TemplateDetailService],
  styleUrls: ['./template-detail.component.css']
})
export class TemplateDetailComponent implements OnInit, OnChanges {
  @Input() templateId?: number;

  error: any
  id: number | undefined;
  template: Template | undefined;
  templateBody: string | undefined;
  inline: boolean = false;
  renderNetwork: boolean = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private TemplateDetailService: TemplateDetailService,
    private http: HttpClient,
  ) {}

  getTemplate(id: number) {
    // Request parameter details so the network can render classes for all PARAM:* nodes
    this.TemplateDetailService.getTemplate(id, true)
      .subscribe({
        next: (data: Template) => { this.template = data },
        error: (error) => this.error = error
      });
  }

  getTemplateBody(id: number, inline: boolean = false) {
    const useInline = !!inline;
    if (useInline) {
      const url = API_URL + `/templates/${id}/body?inline=true`;
      this.http.get(url, { responseType: 'text' })
        .subscribe({
          next: (data: string) => { this.templateBody = data; },
          error: (error) => this.error = error
        });
    } else {
      this.TemplateDetailService.getTemplateBody(id)
        .subscribe({
          next: (data: string) => { this.templateBody = data; },
          error: (error) => this.error = error
        });
    }
  }

  ngOnInit(): void {
    const routeId = this.route.snapshot.paramMap.get('id');
    const idFromRoute = routeId ? parseInt(routeId, 10) : undefined;
    this.id = this.templateId ?? idFromRoute;

    const inlineParam = (this.route.snapshot.queryParamMap.get('inline') || '').toLowerCase();
    this.inline = inlineParam === 'true' || inlineParam === '1';

    if (typeof this.id === 'number' && !isNaN(this.id)) {
      this.getTemplate(this.id);
      this.getTemplateBody(this.id, this.inline);
    }

    // React to inline query param changes
    this.route.queryParamMap.subscribe((qp) => {
      const ip = (qp.get('inline') || '').toLowerCase();
      const newInline = ip === 'true' || ip === '1';
      if (newInline !== this.inline) {
        this.inline = newInline;
        if (typeof this.id === 'number' && !isNaN(this.id)) {
          this.getTemplateBody(this.id, this.inline);
          this.refreshNetwork();
        }
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['templateId'] && typeof this.templateId === 'number' && !isNaN(this.templateId)) {
      this.id = this.templateId;
      this.getTemplate(this.templateId);
      this.getTemplateBody(this.templateId, this.inline);
      this.refreshNetwork();
    }
  }

  private refreshNetwork(): void {
    this.renderNetwork = false;
    setTimeout(() => { this.renderNetwork = true; });
  }

  onInlineToggle(): void {
    // Immediately re-fetch the body using the proper inline URL param
    if (typeof this.id === 'number' && !isNaN(this.id)) {
      this.getTemplateBody(this.id, this.inline);
      this.refreshNetwork();
    }
    // Update URL query param to reflect current state
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { inline: this.inline ? 'true' : 'false' },
      queryParamsHandling: 'merge'
    });
  }
}
