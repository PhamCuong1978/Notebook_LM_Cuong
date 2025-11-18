import { FunctionDeclaration, Type } from '@google/genai';

export const aiTools: FunctionDeclaration[] = [
  {
    name: 'list_notebooks',
    description: 'Liệt kê tất cả các sổ ghi chú có sẵn để người dùng có thể chọn.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: [],
    },
  },
  {
    name: 'open_notebook',
    description: 'Mở một sổ ghi chú cụ thể để xem và làm việc với các nguồn của nó.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        notebookName: {
          type: Type.STRING,
          description: 'Tên chính xác của sổ ghi chú cần mở. Phải khớp với một trong các tên từ `list_notebooks`.',
        },
      },
      required: ['notebookName'],
    },
  },
  {
    name: 'create_mind_map',
    description: 'Tạo một bản đồ tư duy từ các nguồn trong một sổ ghi chú được chỉ định và mở nó trong một tab mới.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        notebookName: {
          type: Type.STRING,
          description: 'Tên của sổ ghi chú được sử dụng để tạo bản đồ tư duy. Phải khớp với một trong các tên từ `list_notebooks`.',
        },
      },
      required: ['notebookName'],
    },
  },
  {
    name: 'create_audio_summary',
    description: 'Tạo một bản tóm tắt bằng âm thanh từ các nguồn trong một sổ ghi chú được chỉ định.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        notebookName: {
          type: Type.STRING,
          description: 'Tên của sổ ghi chú được sử dụng để tạo bản tóm tắt âm thanh. Phải khớp với một trong các tên từ `list_notebooks`.',
        },
      },
      required: ['notebookName'],
    },
  },
  {
    name: 'answer_question_from_sources',
    description: 'Trả lời câu hỏi của người dùng dựa trên nội dung của các nguồn trong một sổ ghi chú cụ thể hoặc tất cả các sổ ghi chú.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            question: {
                type: Type.STRING,
                description: 'Câu hỏi của người dùng.',
            },
            notebookName: {
                type: Type.STRING,
                description: '(Tùy chọn) Tên của sổ ghi chú cụ thể để tìm câu trả lời. Nếu không được cung cấp, hãy tìm kiếm trên tất cả các sổ ghi chú.',
            },
        },
        required: ['question'],
    },
  }
];
