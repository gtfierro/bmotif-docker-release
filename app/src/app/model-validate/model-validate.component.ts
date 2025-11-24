import { Component, Input, OnInit } from '@angular/core';
import { ModelValidateService, ValidationResponse } from './model-validate.service';

@Component({
  selector: 'app-model-validate',
  templateUrl: './model-validate.component.html',
  styleUrls: ['./model-validate.component.css'],
})
export class ModelValidateComponent implements OnInit{
  @Input() modelId: number | undefined;
  validationResponse?: ValidationResponse = undefined;
  showValidatingSpinner = false;

  codeMirrorOptions: any = {
    theme: 'material',
    mode: 'text',
    lineNumbers: true,
    lineWrapping: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter', 'CodeMirror-lint-markers'],
    autoCloseBrackets: true,
    matchBrackets: true,
    lint: true,
    readOnly: true,
  };

  constructor(private modelValidateService: ModelValidateService) {}

  ngOnInit(): void {
    // No initialization needed; parent view can trigger validate()
  }

  validate(force: boolean = false): void {
    if (this.modelId === undefined) return;

    // Use service-level cache so results persist across component instances/tabs
    if (!force) {
      const cached = this.modelValidateService.getCachedValidation(this.modelId);
      if (cached) {
        this.validationResponse = cached;
        return;
      }
      if (this.validationResponse) {
        return;
      }
    }

    this.showValidatingSpinner = true;
    // Call validation with no library_ids to use the model's manifest
    this.modelValidateService.validateModel(this.modelId, undefined, { force }).subscribe(
      res => {
        this.validationResponse = res;
        // caching now handled in service; no need to set here
      },
      err => {},
      () => { this.showValidatingSpinner = false; },
    );
  }
}
