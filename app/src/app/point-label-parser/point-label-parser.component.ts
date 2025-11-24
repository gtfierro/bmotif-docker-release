import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { FormControl } from '@angular/forms';
import { DemoStateService } from '../demostate.service';

@Component({
  selector: 'app-point-label-parser',
  templateUrl: './point-label-parser.component.html',
  styleUrls: ['./point-label-parser.component.css'],
  encapsulation: ViewEncapsulation.None,
})
export class PointLabelParserComponent implements OnInit {
  parserSourceControl: FormControl;

  codeMirrorOptions: any = {
    theme: 'material',
    mode: 'python',
    lineNumbers: true,
    viewportMargin: Infinity,
    lineWrapping: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter', 'CodeMirror-lint-markers'],
    autoCloseBrackets: true,
    matchBrackets: true,
    lint: true
  };

  constructor(private demoStateService: DemoStateService) {
    this.parserSourceControl = new FormControl(this.demoStateService.getParserSourcePy());
  }

  ngOnInit(): void {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files && input.files.length > 0 ? input.files[0] : null;
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const content = (e.target?.result ?? '') as string;
        this.parserSourceControl.setValue(content ?? '');
        this.demoStateService.setParserSourcePy(content ?? '');
      };
      reader.readAsText(file);
    }
    if (input) {
      input.value = '';
    }
  }

  saveParserSource(): void {
    this.demoStateService.setParserSourcePy(this.parserSourceControl.value);
  }
}
